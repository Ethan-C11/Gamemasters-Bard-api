export enum Ambiance {
    // Combat
    COMBAT = 'combat',               // affrontement direct
    SKIRMISH = 'skirmish',           // escarmouche, tension militaire
    SIEGE = 'siege',                 // Siège avec bombardement, combat et civils en panique

    // Tension / Danger
    TENSION = 'tension',             // danger imminent
    INFILTRATION = 'infiltration',   // furtivité, discrétion
    INVESTIGATION = 'investigation', // enquête, exploration prudente
    HORROR = 'horror',               // horreur, malaise

    // Neutre / Exploration
    EXPLORATION = 'exploration',     // découverte, voyage
    TRAVEL = 'travel',               // déplacement, chemin
    MYSTERY = 'mystery',             // ambiguïté, inconnu

    // Calme / Social
    CALM = 'calm',                   // repos, nature paisible
    TAVERN = 'tavern',               // social, animation douce
    CEREMONY = 'ceremony',           // rituel, solennité

    // Magique / Épique
    MAGICAL = 'magical',             // merveilleux, arcane
    EPIC = 'epic',                   // moment clé, révélation
    TRIUMPH = 'triumph',             // victoire, accomplissement
    LAST_STAND = 'last_stand',       // dernier recours, épique, sacrifice...
}