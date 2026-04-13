import { fmsPatternKeys } from './shared-types.js';
const genericMovementPainPrompt = 'Tell me immediately if you feel any pain.';
const clearingPainPrompt = 'Do you feel pain during the clearing test?';
export const fmsDisclaimer = 'This screen does not replace evaluation by a qualified professional such as a physician or personal trainer. It is only a movement-screening tool. If you feel pain during any movement, stop immediately and seek professional evaluation.';
export const fmsVoiceDisclaimer = 'This screen does not replace a professional opinion. Stop if you feel pain at any time.';
export const fmsOpeningVoice = 'We are starting the Functional Movement Screen. This does not replace professional medical or training advice. Stop if you feel pain. Complete all seven movements to receive your results.';
export const fmsRequiredEquipment = [
    'Dowel or broomstick',
    '2x6 board or a flat raised board',
    'Hurdle set to tibial tuberosity height',
    'Measuring device or tape measure'
];
export const fmsEquipmentNotes = [
    'Dowel may be replaced by a broomstick or straight PVC pipe.',
    'A 2x6 board may be replaced by a flat raised board with a consistent height.',
    'Keep the full body and the equipment in frame before each movement.'
];
const genericRightLeftOptions = (score3, score2, score1) => [
    {
        value: 3,
        label: 'Score 3',
        description: score3
    },
    {
        value: 2,
        label: 'Score 2',
        description: score2
    },
    {
        value: 1,
        label: 'Score 1',
        description: score1
    }
];
const patternDefinitions = [
    {
        key: 'deepSquat',
        name: 'Deep Squat',
        equipment: ['Dowel'],
        cameraView: 'Side profile preferred',
        instructions: [
            'Feet about shoulder width apart with toes forward.',
            'Press the dowel overhead and squat as deep as possible.',
            'Keep your heels down and hold the bottom briefly before standing back up.'
        ],
        buildVoiceScript: () => 'Deep Squat. Equipment needed: dowel. Stand with your feet about shoulder width apart and toes forward. Press the dowel overhead. Hold still while I check your position. Good. Squat down as deep as possible, keep your heels down, hold the bottom briefly, and stand back up.',
        buildScoreOptions: () => genericRightLeftOptions('Torso stayed upright or parallel to the tibia, the femur went below horizontal, knees stayed aligned over the feet, and the dowel stayed over the feet.', 'The pattern was completed only after repeating with the heels elevated on the board.', 'The pattern could not be completed cleanly even after the heel-elevated repeat.')
    },
    {
        key: 'hurdleStep',
        name: 'Hurdle Step',
        equipment: ['Dowel', 'Hurdle'],
        cameraView: 'Side profile of the moving direction',
        instructions: [
            'Stand tall with feet together and the dowel across the shoulders.',
            'Lift the working leg, step over the hurdle, touch the floor with the heel, and return.',
            'Score the moving leg and then switch sides.'
        ],
        buildVoiceScript: (_sex, side) => `Hurdle Step. Equipment needed: dowel and hurdle. Stand tall with your feet together and the dowel across your shoulders. Hold still while I check your position. Good. Lift your ${side ?? 'right'} leg, step over the hurdle, touch the floor with your heel, and return.`,
        buildScoreOptions: () => genericRightLeftOptions('Hips, knees, and ankles stayed aligned, lumbar movement stayed minimal, and balance was controlled.', 'The step was completed but alignment or trunk control was lost during the movement.', 'The foot contacted the hurdle or balance was lost.')
    },
    {
        key: 'inlineLunge',
        name: 'Inline Lunge',
        equipment: ['Dowel', '2x6 board'],
        cameraView: 'Side profile preferred',
        instructions: [
            'Place the dowel along the spine touching the head, upper back, and hips.',
            'Use the marked split stance on the board with both toes forward.',
            'Lower until the rear knee touches behind the front heel, then return to standing.'
        ],
        buildVoiceScript: () => 'Inline Lunge. Equipment needed: dowel and board. Place the dowel along your spine so it touches your head, upper back, and hips. Get your feet into the marked split stance. Hold still while I check your position. Good. Lower into the lunge until your knee touches behind the front heel, then return to standing.',
        buildScoreOptions: () => genericRightLeftOptions('The dowel contacts were maintained, the dowel stayed vertical, the torso stayed stable, and the knee touched behind the front heel.', 'The lunge was completed but dowel contacts, vertical control, or the knee target were not maintained.', 'Balance was lost during the lunge.')
    },
    {
        key: 'shoulderMobility',
        name: 'Shoulder Mobility',
        equipment: ['Measuring device'],
        cameraView: 'Back view preferred',
        instructions: [
            'Stand tall and make fists with the fingers wrapped around the thumbs.',
            'Reach one fist over the shoulder and down the back while the other goes up the back in one motion.',
            'Do not inch the hands closer after the first placement.'
        ],
        buildVoiceScript: () => 'Shoulder Mobility. Equipment needed: measuring device. Stand tall. Make a fist with both hands. Reach one fist over your shoulder and down your back, and the other up your back in one motion. Do not move your hands closer after placing them. Hold still.',
        buildScoreOptions: () => genericRightLeftOptions('The fists finished within one hand length.', 'The fists finished within one and a half hand lengths.', 'The fists were farther apart than one and a half hand lengths.')
    },
    {
        key: 'activeStraightLegRaise',
        name: 'Active Straight-Leg Raise',
        equipment: ['2x6 board', 'Measuring device'],
        cameraView: 'Side profile while lying on the floor',
        instructions: [
            'Lie flat with both knees against the board and both toes up.',
            'Keep the raised leg straight and the non-moving leg flat on the board.',
            'Lift the working leg as high as possible without bending the knee.'
        ],
        buildVoiceScript: () => 'Active Straight-Leg Raise. Equipment needed: board and measuring device. Lie flat on your back with your legs straight and your toes up. Keep both arms by your sides with palms up. Pull one foot toward your shin. Hold still while I check your position. Good. Raise that leg as high as possible without bending the knee or lifting the other leg.',
        buildScoreOptions: () => genericRightLeftOptions('The malleolus line reached between the opposite mid-thigh and ASIS with the non-moving leg staying neutral.', 'The malleolus line reached between the opposite mid-thigh and knee joint line with the non-moving leg staying neutral.', 'The malleolus line stayed below the opposite knee joint line or the non-moving leg compensated.')
    },
    {
        key: 'trunkStabilityPushUp',
        name: 'Trunk Stability Push-Up',
        equipment: ['No equipment'],
        cameraView: 'Side profile while lying prone',
        instructions: [
            'Lie face down with arms extended overhead and legs together.',
            'Lift the knees and elbows off the ground and push up as one rigid unit.',
            'Hand placement depends on sex and must be checked before the attempt.'
        ],
        buildVoiceScript: (sex) => {
            const score3Placement = sex === 'female' ? 'thumbs aligned with the chin' : 'thumbs aligned with the forehead';
            const score2Placement = sex === 'female' ? 'thumbs aligned with the clavicle' : 'thumbs aligned with the chin';
            return `Trunk Stability Push-Up. No equipment needed. Lie face down with your hands in the marked starting position. For your selected standard, score 3 starts with ${score3Placement} and score 2 starts with ${score2Placement}. Hold still while I check your setup. Good. Keep your body rigid and push up as one unit. Do not let your hips sag.`;
        },
        buildScoreOptions: (sex) => {
            const score3Placement = sex === 'female' ? 'thumbs aligned with the chin' : 'thumbs aligned with the forehead';
            const score2Placement = sex === 'female' ? 'thumbs aligned with the clavicle' : 'thumbs aligned with the chin';
            return genericRightLeftOptions(`The body lifted as one unit with no spinal lag using ${score3Placement}.`, `The body lifted as one unit with no spinal lag using ${score2Placement}.`, 'The push-up could not be completed at the adjusted hand position.');
        }
    },
    {
        key: 'rotaryStability',
        name: 'Rotary Stability',
        equipment: ['2x6 board'],
        cameraView: '45-degree rear-side view preferred',
        instructions: [
            'Start on hands and knees over the board with the board centered under the body.',
            'Extend the same-side arm and leg, then bring elbow and knee together above the board.',
            'If the same-side pattern fails, use the diagonal regression for score 2.'
        ],
        buildVoiceScript: (_sex, side) => `Rotary Stability. Equipment needed: board. Get on your hands and knees over the board. Hold still while I check your position. Good. Reach your ${side === 'left' ? 'left' : 'right'} arm forward and your ${side === 'left' ? 'left' : 'right'} leg backward. Now bring your elbow and knee together over the board, extend again, and return to start.`,
        buildScoreOptions: () => genericRightLeftOptions('A correct same-side repetition was completed.', 'The same-side repetition failed, but the diagonal regression was completed correctly.', 'The diagonal regression could not be completed.')
    }
];
const clearingInstructions = {
    deepSquat: [],
    hurdleStep: [],
    inlineLunge: [],
    shoulderMobility: [
        'Place the hand on the opposite shoulder.',
        'Raise the elbow without forcing the range.',
        'Report pain immediately if it appears.'
    ],
    activeStraightLegRaise: [],
    trunkStabilityPushUp: [
        'Perform the spinal extension clearing movement after the push-up score.',
        'Move only within a tolerable range and report pain immediately.'
    ],
    rotaryStability: [
        'Perform the spinal flexion clearing movement after rotary stability.',
        'Move only within a tolerable range and report pain immediately.'
    ]
};
export function createEmptyFmsPatterns() {
    return {
        deepSquat: { pain: false, notes: [], confidence: 1 },
        hurdleStep: { pain: false, notes: [], confidence: 1 },
        inlineLunge: { pain: false, notes: [], confidence: 1 },
        shoulderMobility: { pain: false, notes: [], confidence: 1 },
        activeStraightLegRaise: { pain: false, notes: [], confidence: 1 },
        trunkStabilityPushUp: { pain: false, notes: [], confidence: 1 },
        rotaryStability: { pain: false, notes: [], confidence: 1 }
    };
}
export function getFmsPatternName(patternKey) {
    const pattern = patternDefinitions.find((item) => item.key === patternKey);
    return pattern?.name ?? patternKey;
}
export function createFmsTasks(sex) {
    const tasks = [];
    for (const pattern of patternDefinitions) {
        if (pattern.key === 'deepSquat' || pattern.key === 'trunkStabilityPushUp') {
            tasks.push({
                id: pattern.key,
                patternKey: pattern.key,
                patternName: pattern.name,
                kind: 'movement',
                equipment: pattern.equipment,
                cameraView: pattern.cameraView,
                instructions: pattern.instructions,
                voiceScript: pattern.buildVoiceScript(sex),
                painPrompt: genericMovementPainPrompt,
                scoreOptions: pattern.buildScoreOptions(sex)
            });
        }
        else {
            for (const side of ['right', 'left']) {
                tasks.push({
                    id: `${pattern.key}-${side}`,
                    patternKey: pattern.key,
                    patternName: pattern.name,
                    kind: 'movement',
                    side,
                    equipment: pattern.equipment,
                    cameraView: pattern.cameraView,
                    instructions: pattern.instructions,
                    voiceScript: pattern.buildVoiceScript(sex, side),
                    painPrompt: genericMovementPainPrompt,
                    scoreOptions: pattern.buildScoreOptions(sex)
                });
            }
        }
        if (pattern.key === 'shoulderMobility') {
            for (const side of ['right', 'left']) {
                tasks.push({
                    id: `${pattern.key}-clearing-${side}`,
                    patternKey: pattern.key,
                    patternName: `${pattern.name} clearing test`,
                    kind: 'clearing',
                    side,
                    equipment: ['No extra equipment'],
                    cameraView: 'Standing side or 3/4 view',
                    instructions: clearingInstructions[pattern.key],
                    voiceScript: 'Next, place your hand on the opposite shoulder and lift your elbow. Tell me if you feel any pain.',
                    painPrompt: clearingPainPrompt,
                    scoreOptions: []
                });
            }
        }
        else if (pattern.key === 'trunkStabilityPushUp') {
            tasks.push({
                id: `${pattern.key}-clearing`,
                patternKey: pattern.key,
                patternName: `${pattern.name} clearing test`,
                kind: 'clearing',
                equipment: ['No equipment'],
                cameraView: 'Prone spinal extension',
                instructions: clearingInstructions[pattern.key],
                voiceScript: 'Good. Now perform the spinal extension clearing movement and tell me if you feel pain.',
                painPrompt: clearingPainPrompt,
                scoreOptions: []
            });
        }
        else if (pattern.key === 'rotaryStability') {
            tasks.push({
                id: `${pattern.key}-clearing`,
                patternKey: pattern.key,
                patternName: `${pattern.name} clearing test`,
                kind: 'clearing',
                equipment: ['No equipment'],
                cameraView: 'Comfortable floor position',
                instructions: clearingInstructions[pattern.key],
                voiceScript: 'Good. Now perform the spinal flexion clearing movement and tell me if you feel pain.',
                painPrompt: clearingPainPrompt,
                scoreOptions: []
            });
        }
    }
    return tasks;
}
export function computeFmsOutcome(patterns) {
    const scores = fmsPatternKeys
        .map((patternKey) => ({ patternKey, score: patterns[patternKey].finalScore }))
        .filter((entry) => entry.score !== undefined);
    const complete = scores.length === fmsPatternKeys.length;
    const totalScore = complete ? scores.reduce((sum, item) => sum + item.score, 0) : undefined;
    const anyPain = fmsPatternKeys.some((patternKey) => {
        const pattern = patterns[patternKey];
        return pattern.pain || pattern.clearingPain === true;
    });
    const anyAsymmetry = fmsPatternKeys.some((patternKey) => {
        const pattern = patterns[patternKey];
        return pattern.rawLeft !== undefined && pattern.rawRight !== undefined && pattern.rawLeft !== pattern.rawRight;
    });
    const lowestScore = complete ? Math.min(...scores.map((item) => item.score)) : undefined;
    const lowestPatterns = lowestScore === undefined
        ? []
        : scores.filter((item) => item.score === lowestScore).map((item) => item.patternKey);
    return {
        complete,
        totalScore,
        anyPain,
        anyAsymmetry,
        lowestPatterns,
        needsProfessionalFollowup: anyPain
    };
}
