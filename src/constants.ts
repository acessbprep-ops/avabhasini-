export const LAKSHANA_QUESTIONS = [
  {
    category: "Vataj (Dryness & Pain Features - Charaka Samhita Chi. 7)",
    questions: [
      { id: "charak_vat_raukshya", label: "Raukshya (Is the lesion dry and rough?)", sanskrit: "रौक्ष्यं", dosha: "Vata", physicalFeature: true },
      { id: "charak_vat_shosha", label: "Shosha (Is there skin wasting, thinning, or atrophy?)", sanskrit: "शोषः", dosha: "Vata", physicalFeature: true },
      { id: "charak_vat_todah", label: "Toda (Is there a pricking or needle-piercing pain?)", sanskrit: "तोदः", dosha: "Vata", physicalFeature: false },
      { id: "charak_vat_shulam", label: "Shula (Is there a severe localized pain?)", sanskrit: "शूलं", dosha: "Vata", physicalFeature: false },
      { id: "charak_vat_sankochana", label: "Sankochana (Is there a sensation of contraction or tightening?)", sanskrit: "सङ्कोचनं", dosha: "Vata", physicalFeature: false },
      { id: "charak_vat_aayama", label: "Aayama (Is there a stretching tension or feeling of extension?)", sanskrit: "आयामः", dosha: "Vata", physicalFeature: false },
      { id: "charak_vat_parushya", label: "Parushya (Is the skin rough and coarse like sandpaper?)", sanskrit: "पारुष्यं", dosha: "Vata", physicalFeature: true },
      { id: "charak_vat_kharabhava", label: "Kharabhava (Is there a hard or coarse texture?)", sanskrit: "खरभावो", dosha: "Vata", physicalFeature: true },
      { id: "charak_vat_harshah", label: "Harsha (Do you feel crawling, tingling, or localized goosebumps?)", sanskrit: "हर्षः", dosha: "Vata", physicalFeature: false },
      { id: "charak_vat_shyavaruna", label: "Shyava-aruna (Is there a dusky, blackish, or reddish-brown discoloration?)", sanskrit: "श्यावारुणत्वं", dosha: "Vata", physicalFeature: true }
    ]
  },
  {
    category: "Pittaj (Heat & Exudation Features - Charaka Samhita Chi. 7)",
    questions: [
      { id: "charak_pit_daha", label: "Daha (Is there a burning or hot sensation?)", sanskrit: "दाहः", dosha: "Pitta", physicalFeature: false },
      { id: "charak_pit_raga", label: "Raga (Is there prominent redness or inflammatory erythema?)", sanskrit: "रागः", dosha: "Pitta", physicalFeature: true },
      { id: "charak_pit_parisrava", label: "Parisrava (Is there weeping or active exudation/discharge?)", sanskrit: "परिस्रवः", dosha: "Pitta", physicalFeature: true },
      { id: "charak_pit_paka", label: "Paka (Is there suppuration, ulceration, or active pus formation?)", sanskrit: "पाकः", dosha: "Pitta", physicalFeature: true },
      { id: "charak_pit_visra_gandha", label: "Visro Gandha (Is there a fleshy, putrid, or foul odor?)", sanskrit: "विस्रो गन्धः", dosha: "Pitta", physicalFeature: false },
      { id: "charak_pit_kleda", label: "Kleda (Is the lesion moist, damp, or wet to touch?)", sanskrit: "क्लेदः", dosha: "Pitta", physicalFeature: true },
      { id: "charak_pit_angapatana", label: "Angapatana (Is there sloughing off or tissue destruction?)", sanskrit: "अङ्गपतनं", dosha: "Pitta", physicalFeature: true }
    ]
  },
  {
    category: "Kaphaj (Coldness & Heaviness Features - Charaka Samhita Chi. 7)",
    questions: [
      { id: "charak_kap_shvaitya", label: "Shvaitya (Is the site pale, hypopigmented, or white?)", sanskrit: "श्वैत्यं", dosha: "Kapha", physicalFeature: true },
      { id: "charak_kap_shaitya", label: "Shaitya (Is the lesion cold to touch?)", sanskrit: "शैत्यं", dosha: "Kapha", physicalFeature: false },
      { id: "charak_kap_kandu", label: "Kandu (Is there severe or persistent itching?)", sanskrit: "कण्डूः", dosha: "Kapha", physicalFeature: false },
      { id: "charak_kap_sthairya", label: "Sthairya (Is the lesion stable, firm, or has well-defined borders?)", sanskrit: "स्थैर्यं", dosha: "Kapha", physicalFeature: true },
      { id: "charak_kap_utsedha", label: "Utsedha (Is the lesion elevated, swollen, or raised?)", sanskrit: "चोत्सेध", dosha: "Kapha", physicalFeature: true },
      { id: "charak_kap_gaurava", label: "Gaurava (Is there a feeling of heaviness in the affected area?)", sanskrit: "गौरव", dosha: "Kapha", physicalFeature: false },
      { id: "charak_kap_sneha", label: "Sneha (Is the skin texture oily, unctuous, or greasy?)", sanskrit: "स्नेहः", dosha: "Kapha", physicalFeature: true },
      { id: "charak_kap_jantu_abhibhakshanam", label: "Jantubhi-abhibhakshanam (Is there a crawling sensation or secondary infection?)", sanskrit: "जन्तुभिरभिभक्षणं", dosha: "Kapha", physicalFeature: false },
      { id: "charak_kap_kledah", label: "Kledah (Is there sticky, cold exudate or wetness?)", sanskrit: "क्लेदः", dosha: "Kapha", physicalFeature: true }
    ]
  }
];

export interface KushthaType {
  id: string;
  name: string;
  category: 'Maha-Kushtha' | 'Kshudra-Kushtha' | 'Kshudra-Roga' | 'Shvitra';
  sanskrit: string;
  description: string;
  matchingFeatures: string[];
  icd11?: string;
  tm2?: string;
  modernName?: string;
}

export const KUSHTHA_TYPES: KushthaType[] = [
  // Maha Kushtha
  { id: 'kapala', name: 'Kapala', sanskrit: 'कापाल', category: 'Maha-Kushtha', modernName: 'Erythrodermic Psoriasis', icd11: 'EA90.2', tm2: 'SF60.Y', description: 'Resembles broken earthen pot, blackish-red, rough/dry.', matchingFeatures: ['blackish_red', 'earthen_pot_shape', 'skin_thin', 'pricking_pain', 'ruksha_texture', 'vishama_edges'] },
  { id: 'udumbara', name: 'Udumbara', sanskrit: 'औदुम्बर', category: 'Maha-Kushtha', modernName: 'Acute Generalised Exanthematous Pustulosis', icd11: 'EH71.1', tm2: 'SF60.Y', description: 'Similar to Udumbara fruit, reddish, burning sensation.', matchingFeatures: ['udumbara_color', 'redness', 'brown_hair', 'burning', 'itching', 'pain', 'snigdha_texture', 'sethira_edges'] },
  { id: 'mandala', name: 'Mandala', sanskrit: 'मण्डल', category: 'Maha-Kushtha', modernName: 'Plaque Psoriasis', icd11: 'EA90.0', tm2: 'SF60.Y', description: 'White/red elevated patches, slow progress, matted.', matchingFeatures: ['white_red_mix', 'slow_progress', 'compact_dense', 'unctuous_snigdha', 'elevated_round', 'matted_patches', 'snigdha_texture', 'sethira_edges'] },
  { id: 'rishyajivha', name: 'Rishyajivha', sanskrit: 'ऋष्यजिह्व', category: 'Maha-Kushtha', modernName: 'Discoid Lupus Erythematosus', icd11: 'EB10.0', tm2: 'SF60.Y', description: 'Deer tongue appearance, rough, brown center.', matchingFeatures: ['deer_tongue_shape', 'red_edges_brown_inside', 'rough_karkasha', 'karkasha_rough', 'vishama_edges'] },
  { id: 'pundarika', name: 'Pundarika', sanskrit: 'पुण्डरीक', category: 'Maha-Kushtha', modernName: 'Psoriasis Vulgaris', icd11: 'EA90.0', tm2: 'SF60.Y', description: 'Lotus petal appearance, white with red edges.', matchingFeatures: ['lotus_petal_shape', 'white_red_edges', 'elevated_patches', 'sethira_edges'] },
  { id: 'sidhma', name: 'Sidhma', sanskrit: 'सिध्म', category: 'Maha-Kushtha', modernName: 'Pityriasis Versicolor', icd11: '1F00.0', tm2: 'SF60.Y', description: 'White-coppery, dust-like particles, mostly on chest.', matchingFeatures: ['white_coppery', 'dusty_particles', 'mostly_on_chest', 'skin_thin', 'scattered_lesions'] },
  { id: 'kakanaka', name: 'Kakanaka', sanskrit: 'काकण', category: 'Maha-Kushtha', modernName: 'Septicemia-related Dermatosis', icd11: 'EB44.1', tm2: 'SF60.Z', description: 'Gunja berry color, intense pain, incurable.', matchingFeatures: ['gunja_color', 'no_suppuration', 'intense_pain', 'sethira_edges'] },
  
  // Kshudra Kushtha
  { id: 'eka', name: 'Eka Kushtha', sanskrit: 'एककुष्ठ', category: 'Kshudra-Kushtha', modernName: 'Ichthyosis Vulgaris', icd11: 'EC10.0', tm2: 'SF60.Y', description: 'Resembles scales of fish, extensive spread.', matchingFeatures: ['fish_scales', 'extensive_spread', 'ruksha_texture'] },
  { id: 'charmakhya', name: 'Charmakhya', sanskrit: 'चर्माख्य', category: 'Kshudra-Kushtha', modernName: 'Xeroderma', icd11: 'EE04', tm2: 'SF60.Y', description: 'Elephant skin appearance, thick skin.', matchingFeatures: ['elephant_skin', 'thick_skin', 'ruksha_texture'] },
  { id: 'kitibha', name: 'Kitibha', sanskrit: 'किटिभ', category: 'Kshudra-Kushtha', modernName: 'Lichen Planus', icd11: 'EA91.0', tm2: 'SF60.Y', description: 'Blackish brown, hard/rough like scar tissue.', matchingFeatures: ['blackish_brown', 'scar_like_hard', 'rough_parusha', 'karkasha_rough'] },
  { id: 'vaipadika', name: 'Vaipadika', sanskrit: 'वैपादिक', category: 'Kshudra-Kushtha', modernName: 'Keratoderma', icd11: 'EE01', tm2: 'SF60.Y', description: 'Cracks in palms/soles, extreme pain.', matchingFeatures: ['palms_soles_cracks', 'excruciating_pain', 'ruksha_texture'] },
  { id: 'alasaka', name: 'Alasaka', sanskrit: 'अलसक', category: 'Kshudra-Kushtha', modernName: 'Lichen Planus', icd11: 'EA91.0', tm2: 'SF60.Y', description: 'Reddish nodules with itching.', matchingFeatures: ['nodules', 'redness', 'itching', 'scattered_lesions'] },
  { id: 'dadru', name: 'Dadru', sanskrit: 'दद्रु', category: 'Kshudra-Kushtha', modernName: 'Tinea Corporis', icd11: '1F20.2', tm2: 'SF60.Y', description: 'Elevated circular patches with papules.', matchingFeatures: ['elevated_circular', 'papules_pidaka', 'redness', 'itching', 'sethira_edges', 'matted_patches'] },
  { id: 'charmadala', name: 'Charmadala', sanskrit: 'चर्मदल', category: 'Kshudra-Kushtha', modernName: 'Contact Dermatitis', icd11: 'EK00', tm2: 'SF60.Y', description: 'Pustules, cracks, extremely sensitive to touch.', matchingFeatures: ['pustules', 'crusty_cracks', 'unbearable_touch', 'redness', 'itching'] },
  { id: 'pama', name: 'Pama', sanskrit: 'पामा', category: 'Kshudra-Kushtha', modernName: 'Atopic Dermatitis', icd11: 'EA80', tm2: 'SF60.Y', description: 'White/red eruptions with intense itching.', matchingFeatures: ['eruptions_pidaka', 'intense_itching', 'white_red_black_mix'] },
  { id: 'visphota', name: 'Visphota', sanskrit: 'विस्फोट', category: 'Kshudra-Kushtha', modernName: 'Bullous Pemphigoid', icd11: 'EA01.1', tm2: 'SF60.Y', description: 'Thin skin with pustules/eruptions.', matchingFeatures: ['pustules_eruptions', 'skin_thin', 'white_red_mix'] },
  { id: 'shataru', name: 'Shataru', sanskrit: 'शतारु', category: 'Kshudra-Kushtha', modernName: 'Ecthyma', icd11: '1D00.1', tm2: 'SF60.Y', description: 'Multiple ulcerated wounds, burning sensation.', matchingFeatures: ['multiple_wounds', 'ulcerated', 'red_black_mix', 'burning'] },
  { id: 'vicarchika', name: 'Vicarchika', sanskrit: 'विचर्चिका', category: 'Kshudra-Kushtha', modernName: 'Atopic Dermatitis (Wet)', icd11: 'EA80', tm2: 'SF60.Y', description: 'Blackish eruptions with heavy weeping/discharge.', matchingFeatures: ['heavy_discharge', 'blackish_brown_eruptions', 'itching'] },
  
  // Shvitra / Kilasa (Vitiligo)
  { id: 'shvitra_vataja', name: 'Shvitra Vata', sanskrit: 'वातज श्वित्र', category: 'Shvitra', modernName: 'Vitiligo (Vataja Type)', icd11: 'ED63', tm2: 'SF60.Y', description: 'Symptom profile: Characteristically dry and rough depigmented patches with a blackish or dusky-red tinge (Krishnaruna / Shyava).', matchingFeatures: ['shvaitya_white_spots', 'ruksha_texture', 'blackish_brown'] },
  { id: 'shvitra_pittaja', name: 'Shvitra Pitta', sanskrit: 'पित्तज श्वित्र', category: 'Shvitra', modernName: 'Vitiligo (Pittaja Type)', icd11: 'ED63', tm2: 'SF60.Y', description: 'Symptom profile: Presents with coppery/reddish hue (Tamra) on white spots, and localized hot burning sensation (Daha).', matchingFeatures: ['shvaitya_white_spots', 'white_coppery', 'burning'] },
  { id: 'shvitra_kaphaja', name: 'Shvitra Kapha', sanskrit: 'कफज श्वित्र', category: 'Shvitra', modernName: 'Vitiligo (Kaphaja Type)', icd11: 'ED63', tm2: 'SF60.Y', description: 'Symptom profile: Characterized by thick, dense, stable white patches (Shveta, Bahala) and persistent localized itching (Kandu).', matchingFeatures: ['shvaitya_white_spots', 'thick_skin', 'itching'] },

  // Mixed / Specialized
  { id: 'yuvana_pidika', name: 'Yuvana Pidika', sanskrit: 'युवानपीडिका', category: 'Kshudra-Roga', modernName: 'Acne Vulgaris', icd11: 'ED80.0', tm2: 'SF60.Y', description: 'Eruptions on face, common in adolescents, due to Kapha-Vata-Rakta.', matchingFeatures: ['eruptions_pidaka', 'redness', 'snigdha_texture'] },
  { id: 'healthy_skin', name: 'Sama Twak', sanskrit: 'समत्वक्', category: 'Kshudra-Roga', modernName: 'Healthy Skin', icd11: 'QA1C.0', tm2: 'SF60.Y', description: 'Graceful, smooth, radiant, and well-nourished skin with perfectly balanced Vata, Pitta, and Kapha.', matchingFeatures: [] }
];

export const KUSHTHA_QUESTIONS = [
  {
    category: "Appearance & Color",
    questions: [
      { id: "shvaitya_white_spots", label: "Are there pale, white, or depigmented spots/patches on the skin (Shvaitya)?", physicalFeature: true },
      { id: "blackish_red", label: "Is the color blackish or reddish (Krishnaruna)?", physicalFeature: true },
      { id: "white_red_mix", label: "Is it a mix of white and red?", physicalFeature: true },
      { id: "white_coppery", label: "Does it have a white-coppery hue?", physicalFeature: true },
      { id: "red_edges_brown_inside", label: "Red on the edges and brown/blackish inside?", physicalFeature: true },
      { id: "white_red_edges", label: "White center with red edges?", physicalFeature: true },
      { id: "gunja_color", label: "Deep red color resembling Gunja berries?", physicalFeature: true },
      { id: "blackish_brown", label: "Is it blackish brown or dusky?", physicalFeature: true },
      { id: "sethira_edges", label: "Are the edges stable and well-defined (Sthira)?", physicalFeature: true },
      { id: "vishama_edges", label: "Are the edges irregular or spreading (Vishama)?", physicalFeature: true }
    ]
  },
  {
    category: "Morphology (Shape & Texture)",
    questions: [
      { id: "earthen_pot_shape", label: "Does it resemble a broken piece of earthen pot?", physicalFeature: true },
      { id: "udumbara_color", label: "Does it resemble the Udumbara (cluster fig) fruit?", physicalFeature: true },
      { id: "elevated_round", label: "Are there elevated round patches?", physicalFeature: true },
      { id: "deer_tongue_shape", label: "Does it resemble a deer tongue (long, rough)?", physicalFeature: true },
      { id: "lotus_petal_shape", label: "Does it resemble lotus petals?", physicalFeature: true },
      { id: "fish_scales", label: "Does the skin resemble scales of a fish?", physicalFeature: true },
      { id: "elephant_skin", label: "Is the skin thick like elephant skin?", physicalFeature: true },
      { id: "scar_like_hard", label: "Is it hard and rough like scar tissue?", physicalFeature: true },
      { id: "palms_soles_cracks", label: "Are there deep cracks in the palms or soles?", physicalFeature: true },
      { id: "ruksha_texture", label: "Is the surface extremely dry/parched (Ruksha)?", physicalFeature: true },
      { id: "snigdha_texture", label: "Is the surface oily or moist (Snigdha)?", physicalFeature: true }
    ]
  },
  {
    category: "Surface Dynamics",
    questions: [
      { id: "skin_thin", label: "Is the skin in the affected area thin?", physicalFeature: true },
      { id: "thick_skin", label: "Is the skin significantly thick (Bahala)?", physicalFeature: true },
      { id: "dusty_particles", label: "Are there dust-like particles when the scale is rubbed?", physicalFeature: false },
      { id: "crusty_cracks", label: "Are there cracks that have become crusty or scaly?", physicalFeature: true },
      { id: "nodules", label: "Are there prominent nodules or lumps (Ganda)?", physicalFeature: true },
      { id: "pustules_eruptions", label: "Are there pustules or small eruptions (Sphota/Pidaka)?", physicalFeature: true },
      { id: "karkasha_rough", label: "Is the texture sandpaper-like (Karkasha)?", physicalFeature: true }
    ]
  },
  {
    category: "Vitality & Progression",
    questions: [
      { id: "slow_progress", label: "Is the progression very slow and steady?", physicalFeature: false },
      { id: "matted_patches", label: "Are the patches matted or linked together?", physicalFeature: true },
      { id: "scattered_lesions", label: "Are the lesions isolated or scattered (Prithak)?", physicalFeature: true },
      { id: "mostly_on_chest", label: "Is the condition located mostly on the chest?", physicalFeature: false },
      { id: "extensive_spread", label: "Is it extensively spread across large areas?", physicalFeature: false },
      { id: "heavy_discharge", label: "Is there excessive weeping or discharge (Srava)?", physicalFeature: true },
      { id: "multiple_wounds", label: "Are there multiple ulcerated wounds?", physicalFeature: true },
      { id: "no_suppuration", label: "Is the lesion non-suppurating (not forming pus)?", physicalFeature: true }
    ]
  },
  {
    category: "Associated Sensations & Lakshanas",
    questions: [
      { id: "itching", label: "Intense or persistent itching (Kandu)?", physicalFeature: false },
      { id: "burning", label: "Burning or hot sensation (Daha)?", physicalFeature: false },
      { id: "excruciating_pain", label: "Is there severe or excruciating pain?", physicalFeature: false },
      { id: "unbearable_touch", label: "Is it painful or unbearable to touch the skin?", physicalFeature: false },
      { id: "numbness", label: "Numbness or loss of sensation in the patch?", physicalFeature: false }
    ]
  }
];

export const DOSHA_THEMES = {
  Vata: {
    bg: "bg-amber-950/30",
    ink: "text-amber-200",
    accent: "bg-amber-600",
    border: "border-amber-800"
  },
  Pitta: {
    bg: "bg-rose-950/30",
    ink: "text-rose-200",
    accent: "bg-rose-600",
    border: "border-rose-800"
  },
  Kapha: {
    bg: "bg-emerald-950/30",
    ink: "text-emerald-200",
    accent: "bg-emerald-600",
    border: "border-emerald-800"
  },
  Sama: {
    bg: "bg-emerald-950/30",
    ink: "text-emerald-200",
    accent: "bg-emerald-600",
    border: "border-emerald-800"
  },
  Neutral: {
    bg: "bg-stone-950/30",
    ink: "text-stone-200",
    accent: "bg-stone-800",
    border: "border-stone-800"
  }
};

export const SAMHITA_KUSHTHA_DATA: Record<string, { lakshanas: string[], dosha: string, type: 'Maha' | 'Kshudra' | 'Kshudra Roga' | 'Shvitra', icd11?: string, tm2?: string, modernName?: string }> = {
  "KAPALA": {
    dosha: "Vata",
    type: "Maha",
    modernName: "Erythrodermic Psoriasis",
    icd11: "EA90.2",
    tm2: "SF60.Y",
    lakshanas: ["Blackish red color (Aruna)", "Rough surface (Parusha)", "Thin like earthen pot shards"]
  },
  "AUDUMBARA": {
    dosha: "Pitta",
    type: "Maha",
    modernName: "Acute Generalised Exanthematous Pustulosis",
    icd11: "EH71.1",
    tm2: "SF60.Y",
    lakshanas: ["Copper color (Tamra)", "Burning sensation (Daha)", "Red hair follicles"]
  },
  "MANDALA": {
    dosha: "Kapha",
    type: "Maha",
    modernName: "Plaque Psoriasis",
    icd11: "EA90.0",
    tm2: "SF60.Y",
    lakshanas: ["White/Pale color (Shveta)", "Oily/Unctuous (Snigdha)", "Circular patches", "Fixity (Sthira)"]
  },
  "RISHYA-JIVHA": {
    dosha: "Vata-Pitta",
    type: "Maha",
    modernName: "Discoid Lupus Erythematosus",
    icd11: "EB10.0",
    tm2: "SF60.Y",
    lakshanas: ["Rough center", "Red margins", "Resembles deer tongue"]
  },
  "PUNDARIKA": {
    dosha: "Kapha-Pitta",
    type: "Maha",
    modernName: "Psoriasis Vulgaris",
    icd11: "EA90.0",
    tm2: "SF60.Y",
    lakshanas: ["White with red edges", "Elevated patches", "Resembles lotus petal"]
  },
  "SIDHMA": {
    dosha: "Kapha-Vata",
    type: "Maha",
    modernName: "Pityriasis Versicolor",
    icd11: "1F00.0",
    tm2: "SF60.Y",
    lakshanas: ["Thin, dusty scaling", "Mostly on chest", "Whiteish or coppery"]
  },
  "KAKANAKA": {
    dosha: "Tridoshic",
    type: "Maha",
    modernName: "Septicemia-related Dermatosis",
    icd11: "EB44.1",
    tm2: "SF60.Z",
    lakshanas: ["Like Gunja berry (red/black)", "Unbearable pain", "Incurable/Critical"]
  },
  "EKA-KUSHTHA": {
    dosha: "Vata-Kapha",
    type: "Kshudra",
    modernName: "Ichthyosis Vulgaris",
    icd11: "EC10.0",
    tm2: "SF60.Y",
    lakshanas: ["Fish-like scales (Matsya-shakala)", "No perspiration", "Extensive spread"]
  },
  "CHARMA-KUSHTHA": {
    dosha: "Vata-Kapha",
    type: "Kshudra",
    modernName: "Xeroderma",
    icd11: "EE04",
    tm2: "SF60.Y",
    lakshanas: ["Thick skin like elephant (Hasti-charma)", "Dry rough landscape"]
  },
  "KITIBHA": {
    dosha: "Vata-Kapha",
    type: "Kshudra",
    modernName: "Lichen Planus",
    icd11: "EA91.0",
    tm2: "SF60.Y",
    lakshanas: ["Blackish-brown patches", "Extremely rough (Khara)", "Intense itching"]
  },
  "VAIPADIKA": {
    dosha: "Vata-Kapha",
    type: "Kshudra",
    modernName: "Keratoderma",
    icd11: "EE01",
    tm2: "SF60.Y",
    lakshanas: ["Deep cracks in palms or soles (Sputana)", "Severe excruciating pain", "Rough/parched surface texture"]
  },
  "ALASAKA": {
    dosha: "Vata-Kapha",
    type: "Kshudra",
    modernName: "Lichen Planus",
    icd11: "EA91.0",
    tm2: "SF60.Y",
    lakshanas: ["Reddish nodules (Pidaka)", "Intense itching", "Scattered dermatological lesions"]
  },
  "DADRU": {
    dosha: "Kapha-Pitta",
    type: "Kshudra",
    modernName: "Tinea Corporis",
    icd11: "1F20.2",
    tm2: "SF60.Y",
    lakshanas: ["Elevated circular patches", "Itching", "Spreading nature", "Matted layout"]
  },
  "CHARMADALA": {
    dosha: "Kapha-Pitta",
    type: "Kshudra",
    modernName: "Contact Dermatitis",
    icd11: "EK00",
    tm2: "SF60.Y",
    lakshanas: ["Pustule eruptions", "Crusty cracks", "Extremely painful or unbearable to touch (Asaha-sparsha)", "Redness and itching"]
  },
  "PAMA": {
    dosha: "Kapha-Pitta",
    type: "Kshudra",
    modernName: "Atopic Dermatitis",
    icd11: "EA80",
    tm2: "SF60.Y",
    lakshanas: ["White or red small eruptions (Pidaka)", "Intense localized itching (Kandu)", "Burning sensation (Daha)"]
  },
  "VISPHOTA": {
    dosha: "Pitta-Kapha",
    type: "Kshudra",
    modernName: "Bullous Pemphigoid",
    icd11: "EA01.1",
    tm2: "SF60.Y",
    lakshanas: ["Thin skin structure", "Pustules or blistering (Sphota)", "Inflammatory redness"]
  },
  "SHATARU": {
    dosha: "Tridoshic",
    type: "Kshudra",
    modernName: "Ecthyma",
    icd11: "1D00.1",
    tm2: "SF60.Y",
    lakshanas: ["Multiple ulcerated wounds (Vrana)", "Burning sensation", "Red-black coloration"]
  },
  "VICHARCHIKA": {
    dosha: "Kapha",
    type: "Kshudra",
    modernName: "Atopic Dermatitis (Wet)",
    icd11: "EA80",
    tm2: "SF60.Y",
    lakshanas: ["Blackish eruptions", "Profuse discharge (Srava)", "Intense itching"]
  },
  "SHVITRA-VATAJA": {
    dosha: "Vata",
    type: "Shvitra",
    modernName: "Vitiligo (Vataja Type)",
    icd11: "ED63",
    tm2: "SF60.Y",
    lakshanas: ["Dry, rough depigmented patch (Ruksha)", "Blackish or dusky-red tinge (Krishnaruna / Shyava)"]
  },
  "SHVITRA-PITTAJA": {
    dosha: "Pitta",
    type: "Shvitra",
    modernName: "Vitiligo (Pittaja Type)",
    icd11: "ED63",
    tm2: "SF60.Y",
    lakshanas: ["Coppery or reddish hue (Tamra-varna)", "Hot burning sensation (Daha)"]
  },
  "SHVITRA-KAPHAJA": {
    dosha: "Kapha",
    type: "Shvitra",
    modernName: "Vitiligo (Kaphaja Type)",
    icd11: "ED63",
    tm2: "SF60.Y",
    lakshanas: ["Thick, dense white patches (Shveta)", "Intense localized itching (Kandu)"]
  },
  "YUVANA-PIDIKA": {
    dosha: "Kapha-Vata",
    type: "Kshudra Roga",
    modernName: "Acne Vulgaris",
    icd11: "ED80.0",
    tm2: "SF60.Y",
    lakshanas: ["Facial eruptions", "Oily base", "Redness", "Common in youth"]
  },
  "SAMA-TWAK": {
    dosha: "Sama",
    type: "Kshudra Roga",
    modernName: "Healthy Skin",
    icd11: "QA1C.0",
    tm2: "SF60.Y",
    lakshanas: ["Radiant skin glow (Prabha)", "Smooth, even texture (Snigdha/Shlakshna)", "Absence of any lesions, scales or eruptions", "Perfect thermal balance (Sama-shaitya/Sama-ushna)"]
  },
  "SAMA TWAK": {
    dosha: "Sama",
    type: "Kshudra Roga",
    modernName: "Healthy Skin",
    icd11: "QA1C.0",
    tm2: "SF60.Y",
    lakshanas: ["Radiant skin glow (Prabha)", "Smooth, even texture (Snigdha/Shlakshna)", "Absence of any lesions, scales or eruptions", "Perfect thermal balance (Sama-shaitya/Sama-ushna)"]
  }
};

export function getSamhitaData(specificKushtha?: string) {
  if (!specificKushtha) return undefined;
  const upper = specificKushtha.toUpperCase().trim();
  
  // Direct match
  if (SAMHITA_KUSHTHA_DATA[upper]) {
    return SAMHITA_KUSHTHA_DATA[upper];
  }
  
  // Replace spaces/underscores with hyphens
  const hyphenated = upper.replace(/[\s_]+/g, '-');
  if (SAMHITA_KUSHTHA_DATA[hyphenated]) {
    return SAMHITA_KUSHTHA_DATA[hyphenated];
  }
  
  // Remove spaces, underscores, and hyphens completely
  const condensed = upper.replace(/[\s_-]+/g, '');
  if (SAMHITA_KUSHTHA_DATA[condensed]) {
    return SAMHITA_KUSHTHA_DATA[condensed];
  }
  
  // Check our manual mapping alias map
  const aliases: Record<string, string> = {
    'UDUMBARA': 'AUDUMBARA',
    'EKA': 'EKA-KUSHTHA',
    'CHARMA': 'CHARMA-KUSHTHA',
    'CHARMAKHYA': 'CHARMA-KUSHTHA',
    'YUVANAPIDIKA': 'YUVANA-PIDIKA',
    'YUVANA-PIDAKA': 'YUVANA-PIDIKA',
    'YUVANA_PIDIKA': 'YUVANA-PIDIKA',
    'YUVANA PIDAKA': 'YUVANA-PIDIKA',
    'YUVANA PIDIKA': 'YUVANA-PIDIKA',
    'SAMA TWAK': 'SAMA-TWAK',
    'SAMATWAK': 'SAMA-TWAK',
    'HEALTHY': 'SAMA-TWAK',
    'HEALTHY SKIN': 'SAMA-TWAK',
    'HEALTHY_SKIN': 'SAMA-TWAK',
    'SHVITRA-VATAJA': 'SHVITRA-VATAJA',
    'SHVITRA-PITTAJA': 'SHVITRA-PITTAJA',
    'SHVITRA-KAPHAJA': 'SHVITRA-KAPHAJA',
    'SHVITRA_VATAJA': 'SHVITRA-VATAJA',
    'SHVITRA_PITTAJA': 'SHVITRA-PITTAJA',
    'SHVITRA_KAPHAJA': 'SHVITRA-KAPHAJA',
    'VATAJASHVITRA': 'SHVITRA-VATAJA',
    'PITTAJASHVITRA': 'SHVITRA-PITTAJA',
    'KAPHAJASHVITRA': 'SHVITRA-KAPHAJA',
    'VATAJA-SHVITRA': 'SHVITRA-VATAJA',
    'PITTAJA-SHVITRA': 'SHVITRA-PITTAJA',
    'KAPHAJA-SHVITRA': 'SHVITRA-KAPHAJA',
    'SHVITRAPITTA': 'SHVITRA-PITTAJA',
    'SHVITRAVATA': 'SHVITRA-VATAJA',
    'SHVITRAKAPHA': 'SHVITRA-KAPHAJA',
    'SHVITRAPITTAJA': 'SHVITRA-PITTAJA',
    'SHVITRAVATAJA': 'SHVITRA-VATAJA',
    'SHVITRAKAPHAJA': 'SHVITRA-KAPHAJA',
    'SHVITRAPIITA': 'SHVITRA-PITTAJA',
    'SHVITRAPITTA_DOMINANT': 'SHVITRA-PITTAJA',
    'SHVITRAVATA_DOMINANT': 'SHVITRA-VATAJA',
    'SHVITRAKAPHA_DOMINANT': 'SHVITRA-KAPHAJA'
  };
  
  const aliasKey = aliases[upper] || aliases[hyphenated] || aliases[condensed];
  if (aliasKey && SAMHITA_KUSHTHA_DATA[aliasKey]) {
    return SAMHITA_KUSHTHA_DATA[aliasKey];
  }
  
  // Fallback: look for partial substring match
  const keys = Object.keys(SAMHITA_KUSHTHA_DATA);
  const matchedKey = keys.find(k => k.includes(upper) || upper.includes(k) || k.replace(/[\s_-]/g, '') === condensed);
  if (matchedKey) {
    return SAMHITA_KUSHTHA_DATA[matchedKey];
  }
  
  return undefined;
}

export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry"
];
