// Orbi screen-space movement controller.
// The caller passes an outer Group that contains BOTH the gradient plane and facial rig.
// Normalized targets: x=-1 left, x=1 right; y=-1 bottom, y=1 top.
export class ScreenMotionController {
    constructor(THREE, {
        motionRoot,
        subject,
        background,
        camera,
        speed = 2.8,
        margin = 0.35,
        enabled = false
    }) {
        if (!THREE || !motionRoot || !subject || !background || !camera) {
            throw new Error('ScreenMotionController requires THREE, motionRoot, subject, background and camera.');
        }

        this.THREE = THREE;
        this.motionRoot = motionRoot;
        this.subject = subject;
        this.background = background;
        this.camera = camera;
        this.speed = speed;
        this.margin = margin;
        this.enabled = Boolean(enabled);
        this.normalizedX = 0;
        this.normalizedY = 0;
        this._warnedBounds = false;
        this.refreshBounds();
    }

    _toRootLocalBounds(object) {
        const box = new this.THREE.Box3().setFromObject(object);
        const rootWorldPosition = new this.THREE.Vector3();
        this.motionRoot.getWorldPosition(rootWorldPosition);
        box.min.x -= rootWorldPosition.x;
        box.max.x -= rootWorldPosition.x;
        box.min.y -= rootWorldPosition.y;
        box.max.y -= rootWorldPosition.y;
        return box;
    }

    refreshBounds() {
        this.subjectBounds = this._toRootLocalBounds(this.subject);
        this.backgroundBounds = this._toRootLocalBounds(this.background);
        return this;
    }

    moveTo(normalizedX, normalizedY) {
        if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
            throw new TypeError('Orbi screen positions must be finite numbers.');
        }
        this.normalizedX = this.THREE.MathUtils.clamp(normalizedX, -1, 1);
        this.normalizedY = this.THREE.MathUtils.clamp(normalizedY, -1, 1);
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
            this.normalizedX = 0;
            this.normalizedY = 0;
        }
        this.refreshBounds();
    }

    _axisTarget(normalized, halfView, subjectMin, subjectMax, backgroundMin, backgroundMax) {
        // Keep all facial features inside the viewport.
        const subjectMinOffset = -halfView + this.margin - subjectMin;
        const subjectMaxOffset = halfView - this.margin - subjectMax;

        // Also keep the large gradient plane covering the viewport, avoiding black gaps.
        const backgroundMinOffset = halfView - backgroundMax;
        const backgroundMaxOffset = -halfView - backgroundMin;

        const minOffset = Math.max(subjectMinOffset, backgroundMinOffset);
        const maxOffset = Math.min(subjectMaxOffset, backgroundMaxOffset);

        // If the current viewport cannot fit the full face/background, stay centred on this axis.
        if (minOffset > 0 || maxOffset < 0 || minOffset > maxOffset) {
            if (!this._warnedBounds) {
                console.warn('[Orbi] Screen movement is constrained because the current viewport cannot fit the complete face and gradient plane.');
                this._warnedBounds = true;
            }
            return 0;
        }

        return normalized < 0
            ? (-Math.abs(normalized)) * Math.max(0, -minOffset)
            : normalized * Math.max(0, maxOffset);
    }

    update(delta) {
        const normalizedX = this.enabled ? this.normalizedX : 0;
        const normalizedY = this.enabled ? this.normalizedY : 0;
        const halfWidth = (this.camera.right - this.camera.left) / 2;
        const halfHeight = (this.camera.top - this.camera.bottom) / 2;

        // Bounds are stored relative to motionRoot, so the current root translation is excluded.
        const targetX = this._axisTarget(
            normalizedX,
            halfWidth,
            this.subjectBounds.min.x,
            this.subjectBounds.max.x,
            this.backgroundBounds.min.x,
            this.backgroundBounds.max.x
        );
        const targetY = this._axisTarget(
            normalizedY,
            halfHeight,
            this.subjectBounds.min.y,
            this.subjectBounds.max.y,
            this.backgroundBounds.min.y,
            this.backgroundBounds.max.y
        );

        this.motionRoot.position.x = this.THREE.MathUtils.damp(
            this.motionRoot.position.x,
            targetX,
            this.speed,
            delta
        );
        this.motionRoot.position.y = this.THREE.MathUtils.damp(
            this.motionRoot.position.y,
            targetY,
            this.speed,
            delta
        );
    }
}