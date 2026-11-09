// Independent per-eye expression controller for Orbi.
// This module creates no geometry, materials, colours or renderers.

const SIDES = ['left', 'right'];

const NUMERIC_FIELDS = [
    'lidClosure',
    'browY',
    'browRotation',
    'pupilX',
    'pupilY'
];

const ALLOWED_FIELDS = new Set([
    ...NUMERIC_FIELDS,
    'eyeStyle'
]);

function createEyeState() {
    return {
        lidClosure: 0,
        browY: 0,
        browRotation: 0,
        pupilX: 0,
        pupilY: 0,
        eyeStyle: 'normal'
    };
}

function copyState(state) {
    return { ...state };
}

export class EyeExpressionController {
    constructor(THREE, { smoothness = 10 } = {}) {
        if (!THREE || !THREE.MathUtils ||
            typeof THREE.MathUtils.damp !== 'function') {
            throw new Error(
                'EyeExpressionController requires THREE.MathUtils.damp.'
            );
        }

        if (!Number.isFinite(smoothness) || smoothness <= 0) {
            throw new RangeError(
                'Eye expression smoothness must be positive.'
            );
        }

        this.THREE = THREE;
        this.smoothness = smoothness;

        this.current = {
            left: createEyeState(),
            right: createEyeState()
        };

        this.target = {
            left: createEyeState(),
            right: createEyeState()
        };
    }

    _assertSide(side) {
        if (!SIDES.includes(side)) {
            throw new TypeError(
                "Eye side must be 'left' or 'right'."
            );
        }
    }

    setEyeTarget(side, updates) {
        this._assertSide(side);

        if (!updates || typeof updates !== 'object' ||
            Array.isArray(updates)) {
            throw new TypeError('Eye target must be an object.');
        }

        for (const [field, value] of Object.entries(updates)) {
            if (!ALLOWED_FIELDS.has(field)) {
                throw new TypeError(
                    `Unsupported eye target field: '${field}'.`
                );
            }

            if (field === 'eyeStyle') {
                if (value !== 'normal' && value !== 'happy') {
                    throw new TypeError(
                        "eyeStyle must be 'normal' or 'happy'."
                    );
                }

                this.target[side].eyeStyle = value;
                continue;
            }

            if (!Number.isFinite(value)) {
                throw new TypeError(
                    `Eye target '${field}' must be a finite number.`
                );
            }

            this.target[side][field] =
                field === 'lidClosure'
                    ? this.THREE.MathUtils.clamp(value, 0, 1)
                    : value;
        }

        return this.getTarget(side);
    }

    setEyeTargets({ left = {}, right = {} } = {}) {
        this.setEyeTarget('left', left);
        this.setEyeTarget('right', right);

        return this.getTargets();
    }

    update(delta) {
        if (!Number.isFinite(delta) || delta < 0) {
            throw new RangeError(
                'Eye expression delta must be non-negative.'
            );
        }

        for (const side of SIDES) {
            const current = this.current[side];
            const target = this.target[side];

            for (const field of NUMERIC_FIELDS) {
                current[field] = this.THREE.MathUtils.damp(
                    current[field],
                    target[field],
                    this.smoothness,
                    delta
                );
            }

            current.eyeStyle = target.eyeStyle;
        }

        return this.getStates();
    }

    getState(side) {
        this._assertSide(side);
        return copyState(this.current[side]);
    }

    getTarget(side) {
        this._assertSide(side);
        return copyState(this.target[side]);
    }

    getStates() {
        return {
            left: this.getState('left'),
            right: this.getState('right')
        };
    }

    getTargets() {
        return {
            left: this.getTarget('left'),
            right: this.getTarget('right')
        };
    }
}