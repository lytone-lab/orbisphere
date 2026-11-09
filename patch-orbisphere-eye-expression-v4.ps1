$ErrorActionPreference = 'Stop'

$mainPath = Join-Path $PSScriptRoot 'main.js'
$modulePath = Join-Path $PSScriptRoot 'orbi-eye-expression.js'
$tempModulePath = "$modulePath.tmp"

if (-not (Test-Path -LiteralPath $mainPath -PathType Leaf)) {
    throw "Cannot find main.js at '$mainPath'. Run this script from the OrbiSphere project folder."
}
if (Test-Path -LiteralPath $modulePath) {
    throw "'$modulePath' already exists. No files have been modified. Inspect it before attempting another patch."
}
if (Test-Path -LiteralPath $tempModulePath) {
    throw "Temporary module '$tempModulePath' already exists. Remove or inspect it before retrying."
}

$bytes = [System.IO.File]::ReadAllBytes($mainPath)
$hasUtf8Bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
$originalText = [System.IO.File]::ReadAllText($mainPath, [System.Text.Encoding]::UTF8)
$newline = if ($originalText.Contains("`r`n")) { "`r`n" } else { "`n" }
$text = $originalText.Replace("`r`n", "`n").Replace("`r", "`n")

function Replace-ExactlyOne {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Needle,
        [Parameter(Mandatory = $true)][string]$Replacement,
        [Parameter(Mandatory = $true)][string]$Description
    )
    $count = ([regex]::Matches($Source, [regex]::Escape($Needle))).Count
    if ($count -ne 1) {
        throw "Safety check failed for '$Description': expected exactly one match, found $count. No file has been modified."
    }
    return $Source.Replace($Needle, $Replacement)
}

# Preflight: confirm this is the expected post-v3 source and all edit anchors exist.
$required = @(
    "import { ScreenMotionController } from './orbi-screen-motion.js';",
    "const BLINK_UPPER_FINISH_AT = 0.86;",
    "facialFeaturesGroup.add(rightEye);",
    "let currentTarget = EXPRESSIONS.neutral;",
    "const clock = new THREE.Clock();`nlet currentBrowRot = 0;`nlet currentBrowY = 0;`nlet currentPupilY = 0;",
    "currentBrowRot = THREE.MathUtils.damp(currentBrowRot, currentTarget.browRot, 10, delta);`n    currentBrowY = THREE.MathUtils.damp(currentBrowY, currentTarget.browY, 10, delta);`n    currentPupilY = THREE.MathUtils.damp(currentPupilY, currentTarget.pupilY, 10, delta);",
    "    const pupilMaxMove = 0.4; `n    eyeData.forEach((data, index) => {`n        data.pupilGroup.position.x = (currentX * pupilMaxMove);`n        data.pupilGroup.position.y = (currentY * pupilMaxMove) + currentPupilY;",
    "    eyeData.forEach((data, index) => {`n        const blinkInfluence = currentTarget.happyEyes`n            ? 0`n            : data.upperLid.update(blinkProgress, blinkDirection);"
)
foreach ($item in $required) {
    if (-not $text.Contains($item)) {
        throw "Preflight failed: expected source section not found. No files have been modified. Missing anchor: $($item.Substring(0, [Math]::Min(90, $item.Length)))"
    }
}

$module = @'
// Independent per-eye expression state for Orbi.
// Values are targets in Orbi's existing local eye coordinate system.
// This module does not create geometry, materials, colours, or renderers.

const SIDES = ['left', 'right'];
const NUMERIC_FIELDS = ['lidClosure', 'browY', 'browRotation', 'pupilX', 'pupilY'];
const ALLOWED_FIELDS = new Set([...NUMERIC_FIELDS, 'eyeStyle']);

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
        if (!THREE || !THREE.MathUtils || typeof THREE.MathUtils.damp !== 'function') {
            throw new Error('EyeExpressionController requires THREE.MathUtils.damp.');
        }
        if (!Number.isFinite(smoothness) || smoothness <= 0) {
            throw new RangeError('Eye expression smoothness must be a positive number.');
        }

        this.THREE = THREE;
        this.smoothness = smoothness;
        this.current = { left: createEyeState(), right: createEyeState() };
        this.target = { left: createEyeState(), right: createEyeState() };
    }

    _assertSide(side) {
        if (!SIDES.includes(side)) {
            throw new TypeError(`Eye side must be 'left' or 'right'; received '${side}'.`);
        }
    }

    setEyeTarget(side, updates) {
        this._assertSide(side);
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            throw new TypeError('Eye target must be an object.');
        }

        for (const [field, value] of Object.entries(updates)) {
            if (!ALLOWED_FIELDS.has(field)) {
                throw new TypeError(`Unsupported eye target field: '${field}'.`);
            }
            if (field === 'eyeStyle') {
                if (value !== 'normal' && value !== 'happy') {
                    throw new TypeError("eyeStyle must be 'normal' or 'happy'.");
                }
                this.target[side].eyeStyle = value;
                continue;
            }
            if (!Number.isFinite(value)) {
                throw new TypeError(`Eye target '${field}' must be a finite number.`);
            }
            this.target[side][field] = field === 'lidClosure'
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

    setBothTargets(updates) {
        this.setEyeTarget('left', updates);
        this.setEyeTarget('right', updates);
        return this.getTargets();
    }

    update(delta) {
        if (!Number.isFinite(delta) || delta < 0) {
            throw new RangeError('Eye expression delta must be a finite, non-negative number.');
        }

        for (const side of SIDES) {
            const current = this.current[side];
            const target = this.target[side];
            for (const field of NUMERIC_FIELDS) {
                current[field] = this.THREE.MathUtils.damp(
                    current[field], target[field], this.smoothness, delta
                );
            }
            // Geometry style is a discrete choice; numeric pose properties remain damped.
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
        return { left: this.getState('left'), right: this.getState('right') };
    }

    getTargets() {
        return { left: this.getTarget('left'), right: this.getTarget('right') };
    }
}
'@

$needle = "import { ScreenMotionController } from './orbi-screen-motion.js';"
$replacement = "import { ScreenMotionController } from './orbi-screen-motion.js';`nimport { EyeExpressionController } from './orbi-eye-expression.js';"
$text = Replace-ExactlyOne $text $needle $replacement 'eye expression module import'

$needle = "const BLINK_UPPER_FINISH_AT = 0.86;"
$replacement = @'
const BLINK_UPPER_FINISH_AT = 0.86;

// Eyebrow follows the same eased upper-lid coverage during a blink.
const BLINK_BROW_BASE_Y = 1.25;
const BLINK_BROW_DROP_DISTANCE = 2.09;
const BLINK_BROW_FOLLOW = 1.0;
const BLINK_BROW_ROTATION_RELAX = 1.0;

// Independent left/right expression targets ease at this response rate.
const EYE_EXPRESSION_SMOOTHNESS = 10;
'@
$text = Replace-ExactlyOne $text $needle $replacement 'eyebrow and eye-expression tuning controls'

$needle = "facialFeaturesGroup.add(rightEye);"
$replacement = @'
facialFeaturesGroup.add(rightEye);

// Each eye now has independent pose targets. Defaults preserve the current face.
const eyeExpressionController = new EyeExpressionController(THREE, {
    smoothness: EYE_EXPRESSION_SMOOTHNESS
});
'@
$text = Replace-ExactlyOne $text $needle $replacement 'per-eye controller initialization'

$oldExpressionBlock = @'
let currentTarget = EXPRESSIONS.neutral;

function setExpression(name) {
    if (!EXPRESSIONS[name]) return;
    currentTarget = EXPRESSIONS[name];
    
    mouthGroup.children.forEach(m => m.visible = false);
    currentTarget.mouth.visible = true;

    eyeData.forEach(data => {
        data.normalEye.visible = !currentTarget.happyEyes;
        data.pupilGroup.visible = !currentTarget.happyEyes; 
        data.happyEye.visible = currentTarget.happyEyes;
        data.highlights.visible = currentTarget.showHighlights;
        data.upperLid.mesh.visible = !currentTarget.happyEyes;
    });
}
'@
$newExpressionBlock = @'
let currentTarget = EXPRESSIONS.neutral;
let currentExpressionName = 'neutral';

function syncEyeStyle(side) {
    const index = side === 'left' ? 0 : 1;
    const data = eyeData[index];
    const isHappy = eyeExpressionController.getTarget(side).eyeStyle === 'happy';
    data.normalEye.visible = !isHappy;
    data.pupilGroup.visible = !isHappy;
    data.happyEye.visible = isHappy;
    data.upperLid.mesh.visible = !isHappy;
}

function setExpression(name) {
    if (!EXPRESSIONS[name]) return;
    currentTarget = EXPRESSIONS[name];
    currentExpressionName = name;

    mouthGroup.children.forEach(m => m.visible = false);
    currentTarget.mouth.visible = true;

    const eyeStyle = currentTarget.happyEyes ? 'happy' : 'normal';
    eyeExpressionController.setEyeTargets({
        left: {
            lidClosure: 0,
            browY: currentTarget.browY,
            browRotation: -currentTarget.browRot,
            pupilX: 0,
            pupilY: currentTarget.pupilY,
            eyeStyle
        },
        right: {
            lidClosure: 0,
            browY: currentTarget.browY,
            browRotation: currentTarget.browRot,
            pupilX: 0,
            pupilY: currentTarget.pupilY,
            eyeStyle
        }
    });

    syncEyeStyle('left');
    syncEyeStyle('right');
    eyeData.forEach(data => {
        data.highlights.visible = currentTarget.showHighlights;
    });
}
'@
$text = Replace-ExactlyOne $text $oldExpressionBlock $newExpressionBlock 'global expression controller integration'

$needle = "setExpression('neutral');"
$replacement = @'
setExpression('neutral');

// Future AI behaviours can set each eye independently without rewriting the blink engine.
// Example targets: lidClosure (0=open, 1=closed), browY, browRotation, pupilX, pupilY, eyeStyle.
window.orbiEyeExpressions = Object.freeze({
    setEyeTarget: (side, target) => {
        eyeExpressionController.setEyeTarget(side, target);
        syncEyeStyle(side);
        return eyeExpressionController.getTarget(side);
    },
    setEyeTargets: (targets) => {
        eyeExpressionController.setEyeTargets(targets);
        syncEyeStyle('left');
        syncEyeStyle('right');
        return eyeExpressionController.getTargets();
    },
    reset: () => setExpression(currentExpressionName),
    getState: (side) => eyeExpressionController.getState(side)
});
'@
$text = Replace-ExactlyOne $text $needle $replacement 'per-eye expression API'

$needle = @'
const clock = new THREE.Clock();
let currentBrowRot = 0;
let currentBrowY = 0;
let currentPupilY = 0;
'@
$replacement = @'
const clock = new THREE.Clock();
'@
$text = Replace-ExactlyOne $text $needle $replacement 'shared expression animation state removal'

$needle = @'
    currentBrowRot = THREE.MathUtils.damp(currentBrowRot, currentTarget.browRot, 10, delta);
    currentBrowY = THREE.MathUtils.damp(currentBrowY, currentTarget.browY, 10, delta);
    currentPupilY = THREE.MathUtils.damp(currentPupilY, currentTarget.pupilY, 10, delta);

    const pupilMaxMove = 0.4; 
    eyeData.forEach((data, index) => {
        data.pupilGroup.position.x = (currentX * pupilMaxMove);
        data.pupilGroup.position.y = (currentY * pupilMaxMove) + currentPupilY;

        if (currentTarget.showHighlights) {
            const wobbleX = Math.sin(time * 5 + index) * 0.05;
            const wobbleY = Math.cos(time * 4 + index) * 0.05;
            const reflectX = -currentX * 0.2;
            const reflectY = -currentY * 0.2;
            data.highlights.position.x = wobbleX + reflectX;
            data.highlights.position.y = wobbleY + reflectY;
        }
    });
'@
$replacement = @'
    const eyeStates = eyeExpressionController.update(delta);
    const pupilMaxMove = 0.4;
    eyeData.forEach((data, index) => {
        const side = index === 0 ? 'left' : 'right';
        const eyeState = eyeStates[side];
        data.pupilGroup.position.x = (currentX * pupilMaxMove) + eyeState.pupilX;
        data.pupilGroup.position.y = (currentY * pupilMaxMove) + eyeState.pupilY;

        if (currentTarget.showHighlights) {
            const wobbleX = Math.sin(time * 5 + index) * 0.05;
            const wobbleY = Math.cos(time * 4 + index) * 0.05;
            const reflectX = -currentX * 0.2;
            const reflectY = -currentY * 0.2;
            data.highlights.position.x = wobbleX + reflectX;
            data.highlights.position.y = wobbleY + reflectY;
        }
    });
'@
$text = Replace-ExactlyOne $text $needle $replacement 'per-eye pupil and expression updates'

$needle = @'
    eyeData.forEach((data, index) => {
        const blinkInfluence = currentTarget.happyEyes
            ? 0
            : data.upperLid.update(blinkProgress, blinkDirection);

        // The eyebrow follows the same eased descent as the upper eyelid.
        const browDrop = blinkInfluence * 2.09;
        data.brow.position.y = 1.25 + currentBrowY - browDrop;

        const rotDir = index === 0 ? -1 : 1;
        data.brow.rotation.z = rotDir * currentBrowRot * (1 - blinkInfluence);
    });
'@
$replacement = @'
    eyeData.forEach((data, index) => {
        const side = index === 0 ? 'left' : 'right';
        const eyeState = eyeStates[side];
        const blinkInfluence = eyeState.eyeStyle === 'happy'
            ? 0
            : data.upperLid.update(blinkProgress, blinkDirection, eyeState.lidClosure);

        // Eyebrow position and rotation follow this eye's own upper-lid coverage.
        const browDrop = blinkInfluence * BLINK_BROW_DROP_DISTANCE * BLINK_BROW_FOLLOW;
        data.brow.position.y = BLINK_BROW_BASE_Y + eyeState.browY - browDrop;
        data.brow.rotation.z = eyeState.browRotation
            * (1 - blinkInfluence * BLINK_BROW_ROTATION_RELAX);
    });
'@
$text = Replace-ExactlyOne $text $needle $replacement 'independent per-eye eyelid and eyebrow animation'

$needle = @'
    function update(progress, direction = 'closing') {
        // Match the tested upper-lid easing. At full closure the upper mask
        // covers the complete circular eye; no lower lid moves or is animated.
        const upperPhase = THREE.MathUtils.clamp(progress / BLINK_UPPER_FINISH_AT, 0, 1);
        // Closing and opening have independent curves. Defaults reproduce the current smooth motion.
        const upperProgress = direction === 'opening'
            ? 1 - applyBlinkEasing(1 - upperPhase, BLINK_OPEN_EASING)
            : applyBlinkEasing(upperPhase, BLINK_CLOSE_EASING);
        const seamY = THREE.MathUtils.lerp(1.39, -radius, upperProgress);
'@
$replacement = @'
    function update(progress, direction = 'closing', expressionClosure = 0) {
        // Match the tested upper-lid easing. At full closure the upper mask
        // covers the complete circular eye; the lower eye boundary never moves.
        const upperPhase = THREE.MathUtils.clamp(progress / BLINK_UPPER_FINISH_AT, 0, 1);
        // Closing and opening have independent curves; defaults retain the current motion.
        const blinkCoverage = direction === 'opening'
            ? 1 - applyBlinkEasing(1 - upperPhase, BLINK_OPEN_EASING)
            : applyBlinkEasing(upperPhase, BLINK_CLOSE_EASING);
        // A deliberate per-eye wink/closure can close one eye independently of the shared blink.
        const upperProgress = Math.max(
            blinkCoverage,
            THREE.MathUtils.clamp(expressionClosure, 0, 1)
        );
        const seamY = THREE.MathUtils.lerp(1.39, -radius, upperProgress);
'@
$text = Replace-ExactlyOne $text $needle $replacement 'upper-lid independent expression closure support'

# Make sure no legacy references to removed shared animation state remain.
foreach ($legacy in @('currentBrowRot', 'currentBrowY', 'currentPupilY')) {
    if ($text.Contains($legacy)) {
        throw "Safety check failed: legacy shared state '$legacy' remains after patch construction. No files have been modified."
    }
}

# Final structural checks before writing either file.
foreach ($check in @(
    "import { EyeExpressionController } from './orbi-eye-expression.js';",
    'const eyeExpressionController = new EyeExpressionController(THREE, {',
    'window.orbiEyeExpressions = Object.freeze({',
    'const eyeStates = eyeExpressionController.update(delta);',
    'data.upperLid.update(blinkProgress, blinkDirection, eyeState.lidClosure)',
    "const BLINK_CLOSE_EASING = 'smootherstep';",
    "const BLINK_OPEN_EASING = 'smootherstep';"
)) {
    if (-not $text.Contains($check)) {
        throw "Final validation failed: expected patched code not found ('$check'). No files have been modified."
    }
}

# Write the new module to a temporary file before touching main.js.
$encoding = if ($hasUtf8Bom) { [System.Text.UTF8Encoding]::new($true) } else { [System.Text.UTF8Encoding]::new($false) }
[System.IO.File]::WriteAllText($tempModulePath, $module.Replace("`n", $newline), $encoding)

# Restore the original newline convention and create a timestamped backup.
$finalText = $text.Replace("`n", $newline)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = "$mainPath.bak-eye-expression-$stamp"
Copy-Item -LiteralPath $mainPath -Destination $backupPath -ErrorAction Stop

try {
    [System.IO.File]::WriteAllText($mainPath, $finalText, $encoding)
    Move-Item -LiteralPath $tempModulePath -Destination $modulePath -ErrorAction Stop
}
catch {
    # Restore main.js if adding the companion module fails.
    Copy-Item -LiteralPath $backupPath -Destination $mainPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tempModulePath -Force -ErrorAction SilentlyContinue
    throw "Patch failed during file installation. main.js restoration was attempted from '$backupPath'. Original error: $($_.Exception.Message)"
}

Write-Host "Orbi per-eye expression and eyebrow synchronisation installed." -ForegroundColor Green
Write-Host "Updated: $mainPath" -ForegroundColor Cyan
Write-Host "Added:   $modulePath" -ForegroundColor Cyan
Write-Host "Backup:  $backupPath" -ForegroundColor Yellow
Write-Host ''
Get-FileHash -LiteralPath $mainPath, $modulePath -Algorithm SHA256 |
    Select-Object Path, Hash |
    Format-Table -AutoSize
