export const exercises = [
    // beginner
    {
        "name": "Negative Push-Ups",
        "routine": "Push-Up",
        "tempo": {
            "go": 4,
            "pause": 0,
            "return": 1,
            "rest": 0
        },
        "reps": 8,
        "sets": 3,
        "rest": 120,
        "level": 1,
    },
    {
        "name": "Scapula Push-Ups",
        "routine": "Push-Up",
        "tempo": {
            "go": 2,
            "pause": 0,
            "return": 1,
            "rest": 0
        },
        "reps": 8,
        "sets": 4,
        "rest": 120,
        "level": 1,
    },
    {
        "name": "Plank Hold",
        "routine": "Push-Up",
        "time": 30,
        "sets": 4,
        "rest": 120,
        "level": 1,
    },
    {
        "name": "Bent Over Barbell Rows",
        "routine": "Pull-Up",
        "tempo": {
            "go": 2,
            "pause": 0,
            "return": 1,
            "rest": 0
        },
        "reps": 15,
        "sets": 3,
        "rest": 180,
        "level": 1,
    },
    {
        "name": "Passive Hang",
        "routine": "Pull-Up",
        "time": 60,
        "sets": 3,
        "rest": 180,
        "level": 1,
    },
    {
        "name": "Deep Squats",
        "routine": "Squat",
        "tempo": {
            "go": 2,
            "pause": 0,
            "return": 1,
            "rest": 0
        },
        "reps": 12,
        "sets": 3,
        "rest": 180,
        "level": 1,
    },
    {
        "name": "Narrow Stance Squats",
        "routine": "Squat",
        "tempo": {
            "go": 2,
            "pause": 0,
            "return": 1,
            "rest": 0
        },
        "reps": 12,
        "sets": 3,
        "rest": 180,
        "level": 1,
    },
    {
        "name": "Bodyweight Squats",
        "routine": "Squat",
        "tempo": {
            "go": 2,
            "pause": 0,
            "return": 1,
            "rest": 0
        },
        "reps": 15,
        "sets": 3,
        "rest": 180,
        "level": 1,
    }
    //
];
const normalTraining = [
    "Negative Push-Ups",
    "Scapula Push-Ups",
    "Plank Hold",
    "Bent Over Barbell Rows",
    "Passive Hang",
    "Deep Squats",
    "Narrow Stance Squats",
    "Bodyweight Squats"
];
// quick lookup table to avoid repeatedly searching by name
const exercisesByName = exercises.reduce((acc, exercise) => {
    acc[exercise.name] = exercise;
    return acc;
}, {});
/**
 * @param {string} name
 * @param {number} restMultiplier
 * @returns {Exercise}
 */
const withRestAdjustment = (name, restMultiplier) => {
    const exercise = exercisesByName[name];
    if (!exercise) {
        throw new Error(`Exercise not found: ${name}`);
    }
    const adjustedRest = typeof exercise.rest === "number"
        ? Math.max(0, Math.round(exercise.rest * restMultiplier))
        : 0;
    return {
        ...exercise,
        baseRest: exercise.rest,
        restMultiplier,
        rest: adjustedRest
    };
};
/** @type {TrainingPrograms} */
export const trainingPrograms = {
    normal: normalTraining.map(name => ({ ...exercisesByName[name] })),
    intensive: [
        {
            group: 1,
            restMultiplier: 1 / 3,
            exercises: [
                "Negative Push-Ups",
                "Bent Over Barbell Rows",
                "Narrow Stance Squats"
            ].map(name => withRestAdjustment(name, 1 / 3))
        },
        {
            group: 2,
            restMultiplier: 1 / 3,
            exercises: [
                "Scapula Push-Ups",
                "Passive Hang",
                "Deep Squats"
            ].map(name => withRestAdjustment(name, 1 / 3))
        },
        {
            group: 3,
            restMultiplier: 1 / 2,
            exercises: [
                "Plank Hold",
                "Bodyweight Squats"
            ].map(name => withRestAdjustment(name, 1 / 2))
        }
    ]
};
export default trainingPrograms;
