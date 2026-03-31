export const squatTraining = {
    coach: {
        name: 'Marco',
        role: 'Noskip squat coach',
        tagline: 'Real-time setup, depth, and posture feedback.',
        bio: 'A single-coach MVP focused on clean squat reps, crisp corrections, and a phone-first training flow.',
        image: 'assets/coach.png'
    },
    session: {
        title: 'Squat posture session',
        subtitle: 'Side-view camera coaching for depth validation, posture checks, and live rep guidance.',
        protocol: {
            sets: 3,
            repsPerSet: 5,
            restSeconds: 15
        },
        readinessTips: [
            'Only side profile or slight 3/4 view is accepted before reps begin.',
            'Your head, shoulders, hips, knees, ankles, heels, and toes must all fit in frame.',
            'The coach waits for a tall neutral stance before starting the first rep.',
            'If the camera loses you or the angle becomes frontal, the coach pauses the rep flow until you reset.'
        ],
        techniqueTips: [
            'Rep counting follows a clear cycle: ready, descend, bottom, ascend, return upright.',
            'Depth is accepted when the knee angle drops to about 95 degrees or the hip reaches knee height.',
            'Heels lifting, excessive torso lean, and rushed tempo trigger correction cues.',
            'Rest mode lasts 15 seconds and the last 5 seconds re-enable the position check before the next set.'
        ],
        livePromises: [
            'Welcome cue plus guided position check at the start.',
            'Short correction cues with cooldown to avoid voice spam.',
            'Saved session output: total reps, valid reps, depth score, posture score.'
        ]
    }
};
