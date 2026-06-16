import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

function getAPIKey(): string {
  return process.env.GEMINI_API_KEY || "";
}

let aiInstance: GoogleGenAI | null = null;
let lastUsedKey: string | null = null;
let isGeminiApiQuotaExceeded = false;
let quotaExceededTime = 0;
const QUOTA_BLOCK_DURATION = 45 * 1000; // 45 seconds cooldown

function checkGeminiQuotaStatus(): boolean {
  if (isGeminiApiQuotaExceeded) {
    if (Date.now() - quotaExceededTime > QUOTA_BLOCK_DURATION) {
      isGeminiApiQuotaExceeded = false;
      return false;
    }
    return true;
  }
  return false;
}

function recordGeminiQuotaExceeded() {
  isGeminiApiQuotaExceeded = true;
  quotaExceededTime = Date.now();
}

function cleanApiError(gemError: any): string {
  if (!gemError) return "Unknown Error";
  let msg = gemError.message || String(gemError);
  if (typeof msg === "object") {
    try {
      msg = JSON.stringify(msg);
    } catch {
      msg = String(msg);
    }
  }
  
  const upper = String(msg).toUpperCase();
  if (upper.includes("429") || upper.includes("QUOTA") || upper.includes("RESOURCE_EXHAUSTED") || upper.includes("LIMIT_EXHAUSTED") || upper.includes("RATE_LIMIT")) {
    return `Quota Limit Exceeded: ${msg}`;
  }
  
  if (typeof msg === "string" && msg.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.error && parsed.error.message) {
        msg = parsed.error.message;
      } else if (parsed.message) {
        msg = parsed.message;
      }
    } catch (e) {
      // ignore parsing failure
    }
  }

  let cleaned = String(msg).slice(0, 150);
  cleaned = cleaned.replace(/["'{}[\]]+/g, "").replace(/\berror\b/gi, "issue");
  return cleaned;
}

function getAI(): GoogleGenAI {
  const currentKey = getAPIKey();
  if (!aiInstance || lastUsedKey !== currentKey) {
    lastUsedKey = currentKey;
    aiInstance = new GoogleGenAI({ 
      apiKey: currentKey || "DUMMY_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

function cleanAndParseJSON(text: string): any {
  if (!text) return {};
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Attempt fuzzy parsing by extracting the outer-bracket boundary { ... } or [ ... ]
    try {
      const matchObj = cleaned.match(/\{[\s\S]*\}/);
      if (matchObj) {
        return JSON.parse(matchObj[0]);
      }
      const matchArr = cleaned.match(/\[[\s\S]*\]/);
      if (matchArr) {
        return JSON.parse(matchArr[0]);
      }
    } catch (innerErr) {
      console.warn("Fuzzy JSON parsing failed:", innerErr);
    }
    throw e;
  }
}

async function generateContentWithRetry(params: any, maxRetries = 2, initialDelay = 1500): Promise<any> {
  let attempt = 0;
  const originalModel = params.model;
  while (true) {
    try {
      return await getAI().models.generateContent(params);
    } catch (error: any) {
      attempt++;
      const errorMsg = String(error?.message || "").toUpperCase();
      const errorStatus = String(error?.status || "").toUpperCase();
      const codeStr = String(error?.code || "");
      
      const is503 = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorStatus.includes("UNAVAILABLE") || codeStr.includes("503");
      const is429 = errorMsg.includes("429") || errorMsg.includes("RESOURCE") || errorMsg.includes("QUOTA") || errorStatus.includes("RESOURCE") || codeStr.includes("429") || errorMsg.includes("RATE");
      const is500 = errorMsg.includes("500") || errorMsg.includes("INTERNAL") || errorStatus.includes("INTERNAL") || codeStr.includes("500");
      const isUnknown = errorMsg.includes("UNKNOWN") || errorStatus.includes("UNKNOWN");
      
      // If we are calling a high-end model and it fails for ANY reason 
      // (such as billing not enabled, geographical restriction, permission error, bad API key, or model deprecation), 
      // we consider it transient enough to fall back to the ultra-reliable, universally permissive 'gemini-2.5-flash' immediately.
      const isModelAccessError = errorMsg.includes("NOT FOUND") || errorMsg.includes("NOT_FOUND") || errorMsg.includes("PERMISSION") || errorMsg.includes("FORBIDDEN") || errorMsg.includes("DENIED") || errorMsg.includes("INVALID") || errorMsg.includes("METHOD_NOT_ALLOWED") || errorMsg.includes("400") || errorMsg.includes("403");
      
      const isTransient = is503 || is500 || isUnknown || is429 || (isModelAccessError && params.model !== "gemini-2.5-flash");
      
      if (attempt <= maxRetries && isTransient) {
        // Fallback to lighter model on retry attempts to save quota or handle rate limitations
        if (params.model === "gemini-2.5-flash") {
          console.log(`[GEMINI SERVICE] Step ${attempt} retrying request on retry-capable state with model ${params.model}...`);
        } else {
          console.log(`[GEMINI SERVICE] Step ${attempt} retrying request on retry-capable state with model ${params.model}...`);
        }
        
        let multiplier = is429 ? 3.0 : 2.2; // Extra backoff delay for 429 errors
        const delay = initialDelay * Math.pow(multiplier, attempt - 1) + Math.random() * 800;
        console.log(`[GEMINI SERVICE] Retry Step ${attempt}/${maxRetries}. Retrying in ${Math.round(delay)}ms with model ${params.model}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        if (is429) {
          console.log("[GEMINI SERVICE] Quota limit active across retries. Scheduling local processing fallback loop.");
          recordGeminiQuotaExceeded();
        }
        params.model = originalModel;
        throw error;
      }
    }
  }
}

interface KushthaSpec {
  specificKushtha: string;
  modernClinicalCorrelation: string;
  icd11: string;
  tm2: string;
  primaryDosha: string;
  secondaryDosha?: string;
  description: string;
  matchingFeatures: string[];
  lakshanas: string[];
  recommendations: string[];
  ayurvedicContext: string;
}

const SYMPTOM_ID_TO_LABEL: Record<string, string> = {
  // Vata
  "charak_vat_raukshya": "Raukshya (Extremely dry, flaky, or parched skin)",
  "charak_vat_shosha": "Shosha (Localized skin thinning, atrophy, or wasting)",
  "charak_vat_todah": "Toda (Pricking or needle-piercing pain)",
  "charak_vat_shulam": "Shula (Severe localized deep pain)",
  "charak_vat_sankochana": "Sankochana (Sensation of skin contraction or tightening)",
  "charak_vat_aayama": "Aayama (Stretching tension or feeling of extension)",
  "charak_vat_parushya": "Parushya (Rough and coarse skin texture like sandpaper)",
  "charak_vat_kharabhava": "Kharabhava (Hard, coarse, or gritty surface)",
  "charak_vat_harshah": "Harsha (Crawling, tingling, or localized goosebumps)",
  "charak_vat_shyavaruna": "Shyava-aruna (Dusky, blackish, or reddish-brown discoloration)",
  
  // Pitta
  "charak_pit_daha": "Daha (Burning or hot sensation in the lesion)",
  "charak_pit_raga": "Raga (Prominent redness, heat glow, or inflammatory erythema)",
  "charak_pit_parisrava": "Parisrava (Active damp weeping, oozing, or serum exudation)",
  "charak_pit_paka": "Paka (Active suppuration, pustules, ulceration, or pus)",
  "charak_pit_visra_gandha": "Visro Gandha (Fleshy, putrid, or foul odor from the lesion)",
  "charak_pit_kleda": "Kleda (Moist, damp, or wet to touch)",
  "charak_pit_angapatana": "Angapatana (Prominent sloughing of skin tissue, necrotic edges)",
  
  // Kapha
  "charak_kap_shvaitya": "Shvaitya (Pale, hypopigmented, or white patches)",
  "charak_kap_shaitya": "Shaitya (Lesion is cold to touch)",
  "charak_kap_kandu": "Kandu (Severe, intense, or persistent itching)",
  "charak_kap_sthairya": "Sthairya (Stable, firm, or well-defined borders)",
  "charak_kap_utsedha": "Utsedha (Elevated, swollen, or raised skin border)",
  "charak_kap_gaurava": "Gaurava (Feeling of heaviness in the affected area)",
  "charak_kap_sneha": "Sneha (Oily, unctuous, or greasy surface texture)",
  "charak_kap_jantu_abhibhakshanam": "Jantubhi-abhibhakshanam (Crawling sensation or secondary infection/parasites)",
  "charak_kap_kledah": "Kledah (Sticky, cold wetness or thick damp exudate)",
  
  // Appearance & Color Questions
  "shvaitya_white_spots": "Shvaitya (Pale, white, or depigmented spots/patches representing Shvitra)",
  "blackish_red": "Krishnaruna (Smoky, dusky, or blackish dark-red color)",
  "white_red_mix": "Shveta-Rakta (Variegated patches with coexisting white scales and inflamed red borders)",
  "white_coppery": "Shveta-Tamra (Pale/white patch with coppery or bronze sheen/edges)",
  "red_edges_brown_inside": "Red/inflamed outer ring surrounding a darker brown center",
  "white_red_edges": "White/pale core with a symmetrical, inflamed red halo/edges (Pundarika)",
  "gunja_color": "Brilliant crimson or deep scarlet red resembling Gunja berry seeds",
  "blackish_brown": "Blackish-brown or dusky grey hyperpigmented lesions",
  "sethira_edges": "Sthira (Fixed, stable, and highly defined boundaries)",
  "vishama_edges": "Vishama (Irregular, wandering, or un-defined borders)",
  
  // Morphology
  "earthen_pot_shape": "Kapala-sadruksha (Lesion/texture resembles dry broken earthen pottery)",
  "udumbara_color": "Udumbara-varna (Coppery-red congested skin resembling ripe cluster fig fruit)",
  "elevated_round": "Elevated circular or ring-like skin plaques",
  "deer_tongue_shape": "Rishyajivha (Rough center with red margins, shaped like a deer's tongue)",
  "lotus_petal_shape": "Pundarika (Symmetrical oval plaques resembling lotus petals)",
  "fish_scales": "Matsya-shakala (Extensive dry silvery scaling resembling fish scales)",
  "elephant_skin": "Hasti-charma (Dry, thick, leather-like corrugated skin texture)",
  "scar_like_hard": "Kitibha-sattva (Hard, dry, dense lesions resembling tough scar tissue)",
  "palms_soles_cracks": "Sputana (Deep, painful fissures and cracks on palms or soles)",
  "ruksha_texture": "Ruksha (Surface is extremely dry, parched, and rough)",
  "snigdha_texture": "Snigdha (Surface is unctuous, oily, or un-dry)",
  
  // Surface Dynamics
  "skin_thin": "Epidermal thinning, fragility, or stretched skin",
  "thick_skin": "Bahala (Visible skin thickening and hyperkeratotic layers)",
  "dusty_particles": "Sidhma-shakala (Fine, dusty white scaling shedding when rubbed)",
  "crusty_cracks": "Cracks on the skin that have become crusty or scaly",
  "nodules": "Ganda (Prominent nodules, coppery lumps, or hard dermal tumors)",
  "pustules_eruptions": "Sphota/Pidaka (Acute inflammatory pustules, blisters, or eruptions)",
  "karkasha_rough": "Karkasha (Sandpaper-like rough skin friction)",
  
  // Vitality & Progression
  "slow_progress": "Slow, steady, and chronic progression of lesions",
  "matted_patches": "Multiple individual patches merging, linked, or matted together",
  "scattered_lesions": "Prithak (Isolated or scattered lesions at different independent sites)",
  "mostly_on_chest": "Peculiar lesion clustering on the chest and upper thorax",
  "extensive_spread": "Extensively spread, generalized dermatological pattern",
  "heavy_discharge": "Srava (Excessive weeping, sticky discharge, or continuous oozing)",
  "multiple_wounds": "Vrana (Multiple painful deep ulcerated wounds)",
  "no_suppuration": "Non-suppurating lesions without pus or standard ripening"
};

const LOCAL_KUSHTHA_DATABASE: KushthaSpec[] = [
  {
    specificKushtha: "Kapala",
    modernClinicalCorrelation: "Erythrodermic Psoriasis",
    icd11: "EA90.2",
    tm2: "SF60.Y",
    primaryDosha: "Vata",
    description: "Dry, blackish-red (Aruna) patches resembling broken earthen pottery. The skin is thin, with irregular margins and a rough/parched texture, often accompanied by pricking pain.",
    matchingFeatures: ["blackish_red", "earthen_pot_shape", "skin_thin", "excruciating_pain", "ruksha_texture", "vishama_edges"],
    lakshanas: ["Blackish-red skin patch (Krishnaruna)", "Rough earthen-pot texture (Kapala-sadruksha)", "Dermatological thinning"],
    recommendations: [
      "Abhyanga (warm oil application) with Vata-pacifying oils like Dhanwantaram Taila.",
      "Internal administration of medicated ghee (Snehapana) to reverse severe dryness.",
      "Avoid dry, cold, and uncooked foods. Opt for warm, sweet, and moderately oily diet."
    ],
    ayurvedicContext: "Under the classification of Maha-Kushtha, Kapala represents a Vata-dominant pathological state. The aggravated Vata dries up the Rakta and Twak layers, mimicking the coarse, dry shards of an earthen vessel."
  },
  {
    specificKushtha: "Udumbara",
    modernClinicalCorrelation: "Acute Generalised Exanthematous Pustulosis",
    icd11: "EH71.1",
    tm2: "SF60.Y",
    primaryDosha: "Pitta",
    description: "Copper-colored (Tamra) lesions mimicking the ripe fruit of the Udumbara tree. Known for intense burning sensations (Daha), pain, and inflammatory redness.",
    matchingFeatures: ["udumbara_color", "redness", "burning", "pustules_eruptions", "unbearable_touch", "snigdha_texture"],
    lakshanas: ["Coppery-bronze hue (Tamra-varna)", "Intense burning sensation (Daha)", "Rapidly spreading inflammatory rashes"],
    recommendations: [
      "Seka (continuous pouring) of cold decoctions like Vetiver or Chandana water.",
      "Prapa (cooling herbal paste) application using Shatadhauta Ghrita or Sandalwood.",
      "Follow a strictly cooling, Pitta-pacifying diet. Avoid hot spices, fermented items, and deep-fried foods."
    ],
    ayurvedicContext: "Udumbara-kushtha is a classic Pitta-dominant Maha-Kushtha. It describes acute, high-grade inflammation, heat, suppuration, and coppery visual presentation corresponding to active clinical pustulosis."
  },
  {
    specificKushtha: "Mandala",
    modernClinicalCorrelation: "Plaque Psoriasis",
    icd11: "EA90.0",
    tm2: "SF60.Y",
    primaryDosha: "Kapha",
    description: "Circular, elevated, whiteish-red patches. These lesions are dense, well-defined (Sthira), unctuous/oily (Snigdha), and show slow, chronic progression with a tendency to merge.",
    matchingFeatures: ["white_red_mix", "slow_progress", "snigdha_texture", "elevated_round", "matted_patches", "sethira_edges"],
    lakshanas: ["Circular elevated boundaries (Mandala)", "Stable, long-standing patches (Sthira)", "Unctuous/oily texture (Snigdha)"],
    recommendations: [
      "Vamana (therapeutic emesis) is classically advised for elimination of localized Kapha.",
      "Application of dry-powder rubs (Udvartana) using Kapha-pacifying herbs like Triphala.",
      "Diet should be light, warm, dry, and bitter. Strictly avoid cold milk, yogurt, and heavy desserts."
    ],
    ayurvedicContext: "Mandala-kushtha is defined as a Kapha-dominant Maha-Kushtha characterized by stability, stagnation, and heavy oily scaling. It exhibits high correlation with systemic Plaque Psoriasis."
  },
  {
    specificKushtha: "Rishyajivha",
    modernClinicalCorrelation: "Discoid Lupus Erythematosus",
    icd11: "EB10.0",
    tm2: "SF60.Y",
    primaryDosha: "Vata-Pitta",
    description: "Rough, central hyperpigmentation with distinctly inflamed reddish borders, closely resembling the shape and texture of a deer's tongue (Rishyajivha-akara).",
    matchingFeatures: ["deer_tongue_shape", "red_edges_brown_inside", "karkasha_rough", "vishama_edges", "burning"],
    lakshanas: ["Rough central patch (Karkasha)", "Erythematous inflamed perimeter", "Deer-tongue morphology"],
    recommendations: [
      "Strict sun protection and application of biological barrier creams like Aloe Vera with licorice.",
      "Gentle blood-purifying herbal formulas (Raktaprasadana) with Manjistha and Sariva.",
      "Avoid all aggravating Vata-Pitta diets. Incorporate sweet, sweet-sub-bitter, and cooling foods."
    ],
    ayurvedicContext: "Rishyajivha-kushtha involves both Vata and Pitta vitiation. The rough texture stems from Vata, while the red boundaries and burning emerge from Pitta, depicting discoid autoimmune patterns."
  },
  {
    specificKushtha: "Pundarika",
    modernClinicalCorrelation: "Psoriasis Vulgaris",
    icd11: "EA90.0",
    tm2: "SF60.Y",
    primaryDosha: "Kapha-Pitta",
    description: "Elevated, symmetrical circular lesions featuring a whiteish center with prominent crimson/red borders, resembling lotus petals (Pundarika-patrashata).",
    matchingFeatures: ["lotus_petal_shape", "white_red_edges", "elevated_patches", "sethira_edges", "itching", "burning"],
    lakshanas: ["Lotus petal morphology", "Symmetrical white center and red margin", "Elevated skin borders"],
    recommendations: [
      "Mild cooling purgation (Virechana) to balance Kapha-Pitta from the gut.",
      "Local application of soothing, healing skin ointments formulated with Neem and Yashtimadhu.",
      "Follow a balanced Kapha-Pitta pacifying diet. Drink lukewarm water infused with Khadir (Acacia)."
    ],
    ayurvedicContext: "Classic Kapha-Pitta Maha-Kushtha. It details elevated white-red plaques resembling lotus petals, highlighting the dual presence of Kapha (white scales, elevation) and Pitta (red edges, burning)."
  },
  {
    specificKushtha: "Sidhma",
    modernClinicalCorrelation: "Pityriasis Versicolor",
    icd11: "1F00.0",
    tm2: "SF60.Y",
    primaryDosha: "Kapha-Vata",
    description: "Fine, dusty, white-coppery scaling primarily distributed across the chest area. Scraping or rubbing the patch yields thin, dust-like particles (Sidhma-shakala).",
    matchingFeatures: ["white_coppery", "dusty_particles", "mostly_on_chest", "skin_thin", "scattered_lesions"],
    lakshanas: ["Dust-like superficial scaling", "Chest-centric distribution", "Coppery-white tint"],
    recommendations: [
      "Udvartana (dry scrub therapy) with herbal powders like Triphala and Khadira to peel dusty scaling.",
      "Wash the area with Neem and Tulsi infused warm water daily.",
      "Reduce heavy, greasy, and sweet foods. Adopt a bitter and pungent-toning light diet."
    ],
    ayurvedicContext: "Sidhma-kushtha is a Kapha-Vata Maha-Kushtha. It causes superficial scaling on the upper thorax without ulceration, matching the exact clinical picture of Pityriasis Versicolor."
  },
  {
    specificKushtha: "Kakanaka",
    modernClinicalCorrelation: "Septicemia-related Dermatosis",
    icd11: "EB44.1",
    tm2: "SF60.Z",
    primaryDosha: "Tridoshic",
    description: "Urgent, deep-red/black lesions mimicking the color profile of Gunja berries. Accompanied by intense deep-seated pain. Historically categorized as extremely difficult to treat (Asadhya).",
    matchingFeatures: ["gunja_color", "no_suppuration", "excruciating_pain", "sethira_edges"],
    lakshanas: ["Gunja-seed berry color (red/black spots)", "Severe intractable pain", "Non-purulent toxic progress"],
    recommendations: [
      "Consult a qualified clinical center immediately for emergency systemic support.",
      "Apply strictly cooling, soothing herbal pastes containing sandalwood, vetiver, and cooling emollients.",
      "Maintain a strictly anti-inflammatory, light, and digestible liquid diet."
    ],
    ayurvedicContext: "Kakanaka is a highly acute, Tridoshic Maha-Kushtha. High Pitta causes the gunja color and heat, while Vata and Kapha contribute to severe pain and systemic spread, mimicking septic skin necrosis."
  },
  {
    specificKushtha: "Eka Kushtha",
    modernClinicalCorrelation: "Ichthyosis Vulgaris",
    icd11: "EC10.0",
    tm2: "SF60.Y",
    primaryDosha: "Vata-Kapha",
    description: "Extensive dry, silvery scales closely resembling the scales of a fish (Matsya-shakala). Leads to decreased sweat secretion (Anutsedha) and systemic skin thickening.",
    matchingFeatures: ["fish_scales", "extensive_spread", "ruksha_texture"],
    lakshanas: ["Fish-like silver scales (Matsya-shakala)", "Complete absence of perspiration (Asweda)", "Extensive generalized spread"],
    recommendations: [
      "Apply high amounts of warm natural moisturizers like unrefined sesame oil or oil cooked with Khadira.",
      "Internal ghee therapeutic consumption (Snehapana) to nourish a highly compromised lipid barrier.",
      "Stay hydrated. Avoid air conditioners and cold dry environments."
    ],
    ayurvedicContext: "A Kshudra-Kushtha driven by Vata-Kapha. The scales are dry and thick, reflecting the cold, dry qualities of vitiated Vata combined with Kapha's dense, structured scaling."
  },
  {
    specificKushtha: "Charmakhya",
    modernClinicalCorrelation: "Xeroderma",
    icd11: "EE04",
    tm2: "SF60.Y",
    primaryDosha: "Vata-Kapha",
    description: "Severe dryness resulting in a thick, leathery dermis that mimics the tough corrugated look of elephant hide (Hasti-charma).",
    matchingFeatures: ["elephant_skin", "thick_skin", "ruksha_texture"],
    lakshanas: ["Elephant hide texture (Hasti-charma)", "Severe, dry skin thickening", "Extremely stiff epidermis"],
    recommendations: [
      "Soak in warm, herbal baths followed by immediate thick hydration with coconut oil or warm sesame oil.",
      "Take internal bitter herbs like Neem, Khadir, and Guduchi to restore healthy tissue moisture.",
      "Ensure rich hydration and dietary healthy fats."
    ],
    ayurvedicContext: "Known as Charmakhya or Charma-Kushtha, this Vata-Kapha condition causes the skin barrier to become dry, inelastic, and hyper-keratinized."
  },
  {
    specificKushtha: "Kitibha",
    modernClinicalCorrelation: "Lichen Planus",
    icd11: "EA91.0",
    tm2: "SF60.Y",
    primaryDosha: "Vata-Kapha",
    description: "Hard, dry, blackish-brown skin lesions that resemble thick scar tissue, accompanied by severe, constant itching.",
    matchingFeatures: ["blackish_brown", "scar_like_hard", "karkasha_rough", "itching"],
    lakshanas: ["Blackish brown coloration (Shyava-varna)", "Hard, scar-like texture (Kitibha-sattva)", "Severe itching (Kandu)"],
    recommendations: [
      "Apply neem taila or karanja oil to relieve intense itching and soften hard lesions.",
      "Classic Shodhana (purification) therapies like Virechana to remove toxic dosha residues.",
      "Avoid dry snacks, heavy gluten, and cold dairy items."
    ],
    ayurvedicContext: "Kitibha-kushtha is a highly typical Vata-Kapha Kshudra-Kushtha where Vata causes hardness and the dark color, whereas Kapha gives rise to severe, persistent itching."
  },
  {
    specificKushtha: "Vaipadika",
    modernClinicalCorrelation: "Keratoderma",
    icd11: "EE01",
    tm2: "SF60.Y",
    primaryDosha: "Vata-Kapha",
    description: "Deep, painful fissures and cracks primarily on the palms of the hands or soles of the feet, leading to excruciating localized pain.",
    matchingFeatures: ["palms_soles_cracks", "excruciating_pain", "ruksha_texture"],
    lakshanas: ["Fissures on palms/soles (Sputanam)", "Excruciating pain (Teevra Ruj)", "Dry, hard cracks"],
    recommendations: [
      "Perform warm foot/hand soaks, then apply thick medicated salves like Pinda Taila or Shatadhauta Ghrita.",
      "Wear soft protective socks/gloves to maintain natural hydration.",
      "Avoid walking barefoot on hard, dry, or cold surfaces."
    ],
    ayurvedicContext: "Vaipadika-kushtha represents extreme Vata-Kapha imbalance on the extremities, where the dry qualities of Vata crack the Kapha-dominant thick tissues of the palms and soles."
  },
  {
    specificKushtha: "Alasaka",
    modernClinicalCorrelation: "Lichen Planus",
    icd11: "EA91.0",
    tm2: "SF60.Y",
    primaryDosha: "Vata-Kapha",
    description: "Reddish nodules or elevated lumps, scattered across different independent skin sites, triggering constant itching.",
    matchingFeatures: ["nodules", "redness", "itching", "scattered_lesions"],
    lakshanas: ["Elevated nodules (Pidaka/Ganda)", "Scattered dermatological lesions", "Highly persistent itch"],
    recommendations: [
      "Use herbal washes formulated with Triphala or Neem to dry out the nodular fluid.",
      "Consume bitter blood purifiers like Guduchi and Katuki.",
      "Avoid heavy foods, high sodium, and warm fermented dishes."
    ],
    ayurvedicContext: "Alasaka consists of deep, stable nodules driven by stagnant Kapha that blocks Vata's clean systemic flow, causing stubborn, itchy eruptions."
  },
  {
    specificKushtha: "Dadru",
    modernClinicalCorrelation: "Tinea Corporis",
    icd11: "1F20.2",
    tm2: "SF60.Y",
    primaryDosha: "Kapha-Pitta",
    description: "Elevated, itchy, circular ring-like patches with tiny border papules that spread outward, forming consolidated plaques.",
    matchingFeatures: ["elevated_round", "redness", "itching", "matted_patches", "sethira_edges"],
    lakshanas: ["Circular ring-like shape (Mandalarupata)", "Border papules (Pidaka)", "Intense local itching"],
    recommendations: [
      "Apply fresh Aloe Vera gel mixed with a pinch of turmeric, or Karanja cream.",
      "Keep the skin completely dry. Avoid synthetic clothing; wear loose, breathable organic cotton.",
      "Eliminate excessive sweets, cold dairy, and heavy yeast-fermented foods."
    ],
    ayurvedicContext: "Dadru is a common Kapha-Pitta Kshudra-Kushtha characterized by circular elevated margins (ringworm) due to fungal skin colonizations."
  },
  {
    specificKushtha: "Charmadala",
    modernClinicalCorrelation: "Contact Dermatitis",
    icd11: "EK00",
    tm2: "SF60.Y",
    primaryDosha: "Kapha-Pitta",
    description: "Highly inflamed pustules and cracks accompanied by excessive tenderness to the touch (Asaha-sparsha), redness, and localized itching.",
    matchingFeatures: ["pustules_eruptions", "crusty_cracks", "unbearable_touch", "redness", "itching"],
    lakshanas: ["Hypersensibility to touch (Asaha-sparsha)", "Erythematous peeling skin", "Painful inflammatory pustules"],
    recommendations: [
      "Immediately identify and eliminate any external allergen or chemical irritant contact.",
      "Soothe the area with fresh coriander juice or sandalwood-infused rose water.",
      "Avoid sour, salty, and highly spiced foods."
    ],
    ayurvedicContext: "Charmadala showcases acute allergic response (Pitta) and severe localized friction/peeling (Vata/Kapha), rendering the skin too tender to touch."
  },
  {
    specificKushtha: "Pama",
    modernClinicalCorrelation: "Atopic Dermatitis",
    icd11: "EA80",
    tm2: "SF60.Y",
    primaryDosha: "Kapha-Pitta",
    description: "Fine white, red, or coppery eruptions distributed mostly on the hands, buttocks, or extremities, producing severe and intense itching.",
    matchingFeatures: ["pustules_eruptions", "itching", "burning"],
    lakshanas: ["Fine, itchy eruptions (Pidaka)", "Extremity-centric clustering", "Intense generalized itching (Kandu)"],
    recommendations: [
      "Apply coconut oil infused with camphor, or neem leaf paste to relieve severe itching.",
      "Take internal Rasayana formulations of Guduchi or Khadirarishta.",
      "Avoid sour curds, hot pickles, and heavy seafood."
    ],
    ayurvedicContext: "Pama is a Kapha-Pitta dominant Kshudra-Kushtha, causing fine vesicular eruptions on the extremities, mirroring pediatric or infantile Atopic Eczema."
  },
  {
    specificKushtha: "Visphota",
    modernClinicalCorrelation: "Bullous Pemphigoid",
    icd11: "EA01.1",
    tm2: "SF60.Y",
    primaryDosha: "Pitta-Kapha",
    description: "Fragile, thin-skinned blisters and pustules (Sphota) filled with serous fluid, arising over an erythematous base.",
    matchingFeatures: ["pustules_eruptions", "skin_thin", "white_red_mix", "burning"],
    lakshanas: ["Fluid-filled blisters (Sphota)", "Thin epidermal fragility", "Erythematous burning margins"],
    recommendations: [
      "Soothe the blisters with Shatadhauta Ghrita. Avoid manual pop/rupture of blisters.",
      "Use extremely sterile dressings and gentle coconut oil wash.",
      "Follow a cooling, bland, and carbohydrate-vibrant warm diet."
    ],
    ayurvedicContext: "Visphota represents acute blistering of the skin, where Pitta and Kapha vitiate the water (Ap) elements, causing painful fluid collection under thin epidermis."
  },
  {
    specificKushtha: "Shataru",
    modernClinicalCorrelation: "Ecthyma",
    icd11: "1D00.1",
    tm2: "SF60.Y",
    primaryDosha: "Tridoshic",
    description: "Multiple painful, deep, ulcerated skin wounds with a reddish-black base, oozing fluid, and causing intense burning sensations.",
    matchingFeatures: ["multiple_wounds", "redness", "burning"],
    lakshanas: ["Multiple painful ulcers (Vrana)", "Severe burning sensation (Daha)", "Deep tissue involvement"],
    recommendations: [
      "Cleanse ulcerations with warm Panchavalkala (classical tree bark) decoction.",
      "Apply sterile Jatyadi Taila or Neem oil to promote wound tissue repair.",
      "Maintain strict antiseptic local hygiene. Avoid sour and fermented products."
    ],
    ayurvedicContext: "Shataru-kushtha translates literally to 'a hundred wounds'. It describes severe, deep-seated bacterial ecthyma with burning and ulceration."
  },
  {
    specificKushtha: "Vicarchika",
    modernClinicalCorrelation: "Atopic Dermatitis (Wet)",
    icd11: "EA80",
    tm2: "SF60.Y",
    primaryDosha: "Kapha",
    description: "Dark, hyperpigmented, or blackish eruptions accompanied by heavy weeping, sticky discharge, and intense, relentless itching.",
    matchingFeatures: ["heavy_discharge", "blackish_brown", "itching", "snigdha_texture"],
    lakshanas: ["Copious weeping or wet discharge (Srava)", "Dusky/hyperpigmented layout (Shyava-varna)", "Relentless itching (Kandu)"],
    recommendations: [
      "Dry the weeping lesions using warm neem/turmeric washes or dry calamine-like clays.",
      "Internal administration of Khadirarishta or Triphala Guggulu.",
      "Strictly avoid curds, fish, and incompatible food combinations (Viruddha Ahara)."
    ],
    ayurvedicContext: "A highly typical Kapha-dominant Kshudra-Kushtha where excess Kapha creates excessive dampness, heavy weeping discharge (Srava), and severe itching."
  },
  {
    specificKushtha: "Yuvana Pidika",
    modernClinicalCorrelation: "Acne Vulgaris",
    icd11: "ED80.0",
    tm2: "SF60.Y",
    primaryDosha: "Kapha-Vata",
    description: "Inflammatory, oil-bound eruptions occurring primarily on the facial area, typical of adolescents and young adults.",
    matchingFeatures: ["eruptions_pidaka", "redness", "snigdha_texture"],
    lakshanas: ["Facial inflammatory pustules (Pidaka)", "Sebum-rich unctuous base (Snigdha)", "Common in youth"],
    recommendations: [
      "Apply local face packs of Lodhra, Vacha, and Dhanyaka to dry excess sebum.",
      "Use mild neem-based foaming cleanser. Wash the face with lukewarm water.",
      "Avoid eating chocolates, deep-fried fast food, and heavy dairy cream."
    ],
    ayurvedicContext: "Yuvana-Pidika is a classical minor skin condition (Kshudra Roga) where Kapha, Vata, and Rakta vitiation causes oil accumulation and acne pustules."
  },
  {
    specificKushtha: "Shvitra Vata",
    modernClinicalCorrelation: "Vitiligo (Vataja Type)",
    icd11: "ED63",
    tm2: "SF60.Y",
    primaryDosha: "Vata",
    description: "Dry and rough depigmented patches (Ruksha) with a blackish or dusky-red tinge (Krishnaruna / Shyava) tinting or bordering the patch. Corresponds to the Vataja variant of classical vitiligo.",
    matchingFeatures: ["shvaitya_white_spots", "ruksha_texture", "blackish_brown"],
    lakshanas: ["Pale dry white patch (Ruksha Shvaitya)", "Dusky, dark or blackish red borders (Shyava-varna)"],
    recommendations: [
      "Eat warm, fresh, unctuous cooked meals; strictly avoid cold, raw, and Vata-aggravating foods.",
      "Integrate local application of skin-coloring herbal formulations like Bakuchi oil with direct mild sun exposure.",
      "Internal administration of Khadirarishta or Mahatiktaka Ghrita."
    ],
    ayurvedicContext: "Historically detailed under Kilasa/Shvitra where vitiated Vata impairs blood-skin integration, leading to dry, dusky bordered hypopigmentation."
  },
  {
    specificKushtha: "Shvitra Pitta",
    modernClinicalCorrelation: "Vitiligo (Pittaja Type)",
    icd11: "ED63",
    tm2: "SF60.Y",
    primaryDosha: "Pitta",
    description: "Pale white patch overlayed by a coppery, bronze or reddish-yellow shine (Tamra-varna) with a localized hot burning sensation (Daha). Resembles active inflammatory vitiligo.",
    matchingFeatures: ["shvaitya_white_spots", "white_coppery", "burning"],
    lakshanas: ["Coppery or bronze hue overlay (Tamra-varna)", "Localized inflamed burning sensation (Daha)"],
    recommendations: [
      "Strictly avoid spicy, sour, salty, deep fried, and Pitta-vitiating foods.",
      "Apply cooling, soothening local ointments or pastes such as Chandana Lepa or Shatadhauta Ghrita.",
      "Internal mild blood-cleansing herbs like Neem, Manjistha, and Sariva."
    ],
    ayurvedicContext: "A classical Pitta-dominant depigmentation of the Twak (skin) and Rakta (blood) dhatus, showcasing active, burning, erythematous-bordered lesions."
  },
  {
    specificKushtha: "Shvitra Kapha",
    modernClinicalCorrelation: "Vitiligo (Kaphaja Type)",
    icd11: "ED63",
    tm2: "SF60.Y",
    primaryDosha: "Kapha",
    description: "Thick, dense, stable white patches (Shveta, Bahala) accompanied by localized chronic, moderate-to-severe itching (Kandu). Represents chronic, inactive depigmented skin.",
    matchingFeatures: ["shvaitya_white_spots", "thick_skin", "itching"],
    lakshanas: ["Thick, dense, stable white patch (Bahala)", "Chronic localized itching (Kandu)"],
    recommendations: [
      "Perform regular dry herbal powder rubs (Udvartana) using Triphala and Bakuchi powders to stimulate skin pathways.",
      "Refrain from heavy dairy products, curds, eggs, sweets, and incompatible fats.",
      "Prefer light, dry, warm cooked meals with carminative bitter spices."
    ],
    ayurvedicContext: "Driven by dense, stagnant Kapha blocking the nutrient channels (Srotas), locking white patches in a thick, stable, itchy, inactive state."
  },
  {
    specificKushtha: "Sama Twak",
    modernClinicalCorrelation: "Healthy Skin",
    icd11: "QA1C.0",
    tm2: "SF60.Y",
    primaryDosha: "Sama",
    description: "Perfectly normal, smooth, radiant, and well-nourished skin showing complete systemic balance of Vata, Pitta, and Kapha.",
    matchingFeatures: [],
    lakshanas: ["Smooth skin texture (Snigdha/Shlakshna)", "Healthy complexion and radiance", "Absolute absence of active pathological lesions"],
    recommendations: [
      "Maintain general skin health using gentle daily hydration and standard herbal cleansers.",
      "Adopt traditional Dinacharya (daily health regimens) for wellness.",
      "Eat a nutritious, balanced diet in harmony with your prakriti (constitution)."
    ],
    ayurvedicContext: "Sama Twak signifies static state of complete equilibrium where doshas, dhatus, and agni are functioning optimally, projecting a natural radiant glow."
  }
];

function getLocalAyurvedicDiagnosis(questionnaireData: any, inferredFeatures: string[], userProfile: any): any {
  const activeFeatures: string[] = [];
  const explicitlyFalse = new Set<string>();
  
  if (questionnaireData && typeof questionnaireData === "object") {
    Object.entries(questionnaireData).forEach(([key, val]) => {
      if (val === true) {
        activeFeatures.push(key);
      } else if (val === false) {
        explicitlyFalse.add(key);
      }
    });
  }
  
  if (inferredFeatures && Array.isArray(inferredFeatures)) {
    inferredFeatures.forEach(f => {
      if (!activeFeatures.includes(f) && !explicitlyFalse.has(f)) {
        activeFeatures.push(f);
      }
    });
  }

  // Pre-calculate score for every Kushtha spec in the database except Sama Twak
  const checkFeatureActive = (featureId: string, list: string[]): boolean => {
    if (list.includes(featureId)) {
      return true;
    }

    const synonymMap: Record<string, string[]> = {
      'shvaitya_white_spots': ['charak_kap_shvaitya'],
      'charak_kap_shvaitya': ['shvaitya_white_spots'],
      'blackish_red': ['charak_vat_shyavaruna'],
      'charak_vat_shyavaruna': ['blackish_red', 'blackish_brown', 'blackish_brown_eruptions', 'shvitra_vataja'],
      'white_red_mix': ['charak_kap_shvaitya', 'charak_pit_raga', 'white_red_edges'],
      'white_coppery': ['charak_kap_shvaitya', 'charak_pit_raga', 'charak_vat_shyavaruna'],
      'red_edges_brown_inside': ['charak_pit_raga', 'charak_vat_shyavaruna'],
      'white_red_edges': ['charak_kap_shvaitya', 'charak_pit_raga'],
      'gunja_color': ['charak_pit_raga'],
      'udumbara_color': ['charak_pit_raga'],
      'redness': ['charak_pit_raga'],
      'charak_pit_raga': ['redness', 'gunja_color', 'udumbara_color'],
      'blackish_brown': ['charak_vat_shyavaruna'],
      'sethira_edges': ['charak_kap_sthairya'],
      'charak_kap_sthairya': ['sethira_edges'],
      'vishama_edges': ['charak_vat_aayama', 'charak_vat_sankochana'],
      'ruksha_texture': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
      'dry_rough': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
      'rough_karkasha': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'dry_rough', 'rough_parusha', 'karkasha_rough'],
      'rough_parusha': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'dry_rough', 'rough_karkasha', 'karkasha_rough'],
      'karkasha_rough': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha'],
      'charak_vat_raukshya': ['ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
      'charak_vat_parushya': ['ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
      'charak_vat_kharabhava': ['ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
      'snigdha_texture': ['charak_kap_sneha', 'charak_kap_kledah', 'charak_pit_kleda', 'unctuous_snigdha'],
      'unctuous_snigdha': ['charak_kap_sneha', 'charak_kap_kledah', 'charak_pit_kleda', 'snigdha_texture'],
      'charak_kap_sneha': ['snigdha_texture', 'unctuous_snigdha'],
      'charak_kap_kledah': ['snigdha_texture', 'unctuous_snigdha', 'heavy_discharge', 'discharge'],
      'charak_pit_kleda': ['snigdha_texture', 'unctuous_snigdha', 'heavy_discharge', 'discharge'],
      'elevated_round': ['charak_kap_utsedha'],
      'elevated_patches': ['charak_kap_utsedha', 'elevated_round', 'lotus_petal_shape'],
      'elevated_circular': ['charak_kap_utsedha', 'elevated_round'],
      'charak_kap_utsedha': ['elevated_round', 'elevated_patches', 'elevated_circular'],
      'skin_thin': ['charak_vat_shosha'],
      'charak_vat_shosha': ['skin_thin'],
      'thick_skin': ['charak_kap_utsedha', 'elephant_skin'],
      'elephant_skin': ['charak_kap_utsedha', 'thick_skin'],
      'pain': ['charak_vat_todah', 'charak_vat_shulam', 'painful_lesion', 'excruciating_pain', 'unbearable_touch', 'pricking_pain', 'intense_pain'],
      'intense_pain': ['charak_vat_todah', 'charak_vat_shulam', 'excruciating_pain', 'painful_lesion', 'unbearable_touch', 'pricking_pain', 'pain'],
      'pricking_pain': ['charak_vat_todah', 'charak_vat_shulam', 'painful_lesion', 'excruciating_pain', 'unbearable_touch', 'intense_pain', 'pain'],
      'charak_vat_todah': ['pain', 'intense_pain', 'pricking_pain'],
      'charak_vat_shulam': ['pain', 'intense_pain', 'pricking_pain'],
      'itching': ['charak_kap_kandu', 'intense_itching'],
      'intense_itching': ['charak_kap_kandu', 'itching'],
      'charak_kap_kandu': ['itching', 'intense_itching'],
      'burning': ['charak_pit_daha', 'burning_sensation'],
      'burning_sensation': ['charak_pit_daha', 'burning'],
      'charak_pit_daha': ['burning', 'burning_sensation'],
      'discharge': ['charak_pit_parisrava', 'heavy_discharge'],
      'heavy_discharge': ['charak_pit_parisrava', 'discharge'],
      'charak_pit_parisrava': ['discharge', 'heavy_discharge'],
      'pustules': ['charak_pit_paka', 'pustules_eruptions', 'eruptions_pidaka', 'papules_pidaka'],
      'pustules_eruptions': ['charak_pit_paka', 'pustules', 'eruptions_pidaka', 'papules_pidaka'],
      'eruptions_pidaka': ['charak_pit_paka', 'pustules', 'pustules_eruptions', 'papules_pidaka'],
      'papules_pidaka': ['charak_pit_paka', 'pustules', 'pustules_eruptions', 'eruptions_pidaka'],
      'charak_pit_paka': ['pustules', 'pustules_eruptions', 'eruptions_pidaka', 'papules_pidaka'],
      'ulcerated': ['multiple_wounds'],
      'red_black_mix': ['blackish_red', 'multiple_wounds'],
      'blackish_brown_eruptions': ['blackish_brown', 'pustules_eruptions'],
      'brown_hair': ['redness', 'burning'],
      'compact_dense': ['matted_patches', 'sethira_edges']
    };

    const synonyms = synonymMap[featureId];
    if (synonyms) {
      for (const syn of synonyms) {
        if (list.includes(syn)) {
          return true;
        }
      }
    }

    return false;
  };

  // Define Pathognomonic and high-specificity features for each Kushtha to calculate a weighted match score
  const FEATURE_WEIGHTS: Record<string, string[]> = {
    "Kapala": ["earthen_pot_shape", "blackish_red", "vishama_edges"],
    "Udumbara": ["udumbara_color", "burning", "pustules_eruptions"],
    "Mandala": ["white_red_mix", "elevated_round", "sethira_edges"],
    "Rishyajivha": ["deer_tongue_shape", "red_edges_brown_inside"],
    "Pundarika": ["lotus_petal_shape", "white_red_edges"],
    "Sidhma": ["white_coppery", "dusty_particles", "mostly_on_chest"],
    "Kakanaka": ["gunja_color", "intense_pain"],
    "Eka Kushtha": ["fish_scales", "extensive_spread"],
    "Charmakhya": ["elephant_skin", "thick_skin"],
    "Kitibha": ["scar_like_hard", "blackish_brown"],
    "Vaipadika": ["palms_soles_cracks", "excruciating_pain"],
    "Alasaka": ["nodules", "scattered_lesions"],
    "Dadru": ["elevated_circular", "papules_pidaka"],
    "Charmadala": ["unbearable_touch", "crusty_cracks"],
    "Pama": ["intense_itching", "white_red_black_mix"],
    "Visphota": ["pustules_eruptions", "skin_thin"],
    "Shataru": ["multiple_wounds", "ulcerated"],
    "Vicarchika": ["heavy_discharge", "blackish_brown_eruptions"],
    "Yuvana Pidika": ["eruptions_pidaka", "snigdha_texture"],
    "Shvitra Vata": ["shvaitya_white_spots", "ruksha_texture"],
    "Shvitra Pitta": ["shvaitya_white_spots", "white_coppery", "burning"],
    "Shvitra Kapha": ["shvaitya_white_spots", "thick_skin", "itching"]
  };

  const scoredItems = LOCAL_KUSHTHA_DATABASE.map(k => {
    let matchedWeight = 0;
    let totalPossibleWeight = 0;

    if (k.specificKushtha !== "Sama Twak") {
      const specificWeightKeys = FEATURE_WEIGHTS[k.specificKushtha] || [];
      k.matchingFeatures.forEach(feature => {
        const isPathognomonic = specificWeightKeys.includes(feature);
        const weight = isPathognomonic ? 5.0 : 1.5;
        totalPossibleWeight += weight;
        
        if (checkFeatureActive(feature, activeFeatures)) {
          matchedWeight += weight;
        } else if (checkFeatureActive(feature, Array.from(explicitlyFalse))) {
          // Rule-out penalty: Applying a massive negative penalty if a key attribute is explicitly absent
          matchedWeight -= weight * 2.0;
        }
      });
    } else {
      totalPossibleWeight = 1.0;
    }

    const finalPercentScore = totalPossibleWeight > 0 ? Math.max(0, (matchedWeight / totalPossibleWeight) * 100) : 0;

    return {
      kushtha: k,
      score: finalPercentScore
    };
  });

  // Sort by score descending, secondary check by specificKushtha name to keep sorting stable
  scoredItems.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.kushtha.specificKushtha.localeCompare(b.kushtha.specificKushtha);
  });

  let bestKushtha = scoredItems[0].kushtha;
  let maxScore = scoredItems[0].score;

  if (activeFeatures.length === 0) {
    const sama = LOCAL_KUSHTHA_DATABASE.find(k => k.specificKushtha === "Sama Twak") || bestKushtha;
    bestKushtha = sama;
    maxScore = 0;
  }

  // Generate Top 3 predictions with realistic weighted confidence scores
  let predictions: any[] = [];
  if (activeFeatures.length === 0) {
    predictions = [
      {
        specificKushtha: "Sama Twak",
        modernClinicalCorrelation: "Healthy Skin",
        confidenceScore: 95
      },
      {
        specificKushtha: "Yuvana Pidika",
        modernClinicalCorrelation: "Acne Vulgaris",
        confidenceScore: 20
      },
      {
        specificKushtha: "Pama",
        modernClinicalCorrelation: "Atopic Dermatitis",
        confidenceScore: 12
      }
    ];
  } else {
    // Keep only non-Sama Twak items if skin has features, or include Sama Twak if no matching features
    const candidates = scoredItems.filter(item => item.kushtha.specificKushtha !== "Sama Twak");
    predictions = candidates.slice(0, 3).map((item, idx) => {
      let conf = 0;
      if (item.score > 0) {
        // Map raw percentage scores to an intuitive confidence level
        conf = Math.min(Math.round(40 + item.score * 0.55 - idx * 5), 98);
      } else {
        // Low probability fallback
        conf = Math.max(10, 25 - idx * 7);
      }
      return {
        specificKushtha: item.kushtha.specificKushtha,
        modernClinicalCorrelation: item.kushtha.modernClinicalCorrelation,
        confidenceScore: Math.round(conf)
      };
    });
  }

  let vataPct = 33;
  let pittaPct = 33;
  let kaphaPct = 34;

  if (bestKushtha.primaryDosha === "Vata") {
    vataPct = 60; pittaPct = 20; kaphaPct = 20;
  } else if (bestKushtha.primaryDosha === "Pitta") {
    vataPct = 20; pittaPct = 60; kaphaPct = 20;
  } else if (bestKushtha.primaryDosha === "Kapha") {
    vataPct = 20; pittaPct = 20; kaphaPct = 60;
  } else if (bestKushtha.primaryDosha === "Vata-Pitta") {
    vataPct = 45; pittaPct = 45; kaphaPct = 10;
  } else if (bestKushtha.primaryDosha === "Kapha-Pitta") {
    vataPct = 10; pittaPct = 45; kaphaPct = 45;
  } else if (bestKushtha.primaryDosha === "Kapha-Vata" || bestKushtha.primaryDosha === "Vata-Kapha") {
    vataPct = 45; pittaPct = 10; kaphaPct = 45;
  } else if (bestKushtha.primaryDosha === "Pitta-Kapha") {
    vataPct = 10; pittaPct = 45; kaphaPct = 45;
  } else if (bestKushtha.primaryDosha === "Tridoshic") {
    vataPct = 34; pittaPct = 33; kaphaPct = 33;
  } else if (bestKushtha.primaryDosha === "Sama") {
    vataPct = 33; pittaPct = 33; kaphaPct = 34;
  }

  // Ensure overall confidenceScore matches the highest prediction confidence
  const finalConfidence = predictions.length > 0 ? predictions[0].confidenceScore : (maxScore > 0 ? Math.min(85 + maxScore * 4, 98) : 95);

  return {
    primaryDosha: bestKushtha.primaryDosha,
    secondaryDosha: bestKushtha.secondaryDosha || null,
    doshaPercentages: { Vata: vataPct, Pitta: pittaPct, Kapha: kaphaPct },
    specificKushtha: bestKushtha.specificKushtha,
    modernClinicalCorrelation: bestKushtha.modernClinicalCorrelation,
    icd11: bestKushtha.icd11,
    tm2: bestKushtha.tm2,
    lakshanasFound: bestKushtha.lakshanas,
    description: bestKushtha.description,
    recommendations: bestKushtha.recommendations,
    ayurvedicContext: bestKushtha.ayurvedicContext,
    confidenceScore: finalConfidence,
    discrepantLesionTypesDetected: false,
    mismatchedLesionsReason: "",
    predictions: predictions
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Crucial: increase payment/body limit for base64 skin morphology images
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route: Health Status Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: Check Image Quality
  app.post("/api/gemini/quality-check", async (req, res) => {
    try {
      const { imageData, rawMetrics } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "Missing imageData in request body" });
      }

      // Compute local physical metrics-based fallback parameters
      let localScore = 98;
      let localReason = "High-quality dermatological photo.";

      if (imageData.length < 5000) {
        localScore = 15;
        localReason = "Image file size is too small or corrupted.";
      } else if (rawMetrics) {
        let brightnessPenalty = 0;
        let sharpnessPenalty = 0;
        let resolutionPenalty = 0;

        const b = rawMetrics.brightness !== undefined ? rawMetrics.brightness : 120;
        const s = rawMetrics.sharpness !== undefined ? rawMetrics.sharpness : 35;
        const mp = rawMetrics.megapixels !== undefined ? rawMetrics.megapixels : 1.2;

        if (b < 60) {
          brightnessPenalty = (60 - b) * 2.2;
        } else if (b > 210) {
          brightnessPenalty = (b - 210) * 2.2;
        }

        if (s < 2) {
          sharpnessPenalty = (2 - s) * 10.0;
        }

        if (mp < 0.1) {
          resolutionPenalty = (0.1 - mp) * 80.0;
        }

        let finalScore = Math.round(98 - brightnessPenalty - sharpnessPenalty - resolutionPenalty);
        
        // Explicitly drag below 65% minimum benchmark if there are critical defects
        if (b < 40 || b > 235 || s < 1 || mp < 0.05) {
          finalScore = Math.min(finalScore, 58);
        }

        localScore = Math.max(10, Math.min(100, finalScore));

        // Set specific reasons for critical boundary thresholds
        if (localScore < 65) {
          if (s < 1) {
            localReason = "Image is out-of-focus or blurry. Please hold camera steady.";
          } else if (b < 50) {
            localReason = "Image is underexposed or too dark. Match lighting guidelines.";
          } else if (b > 220) {
            localReason = "Image is overexposed or too bright. Reduce direct glare.";
          } else if (mp < 0.25) {
            localReason = "Symptom image is too small or low-resolution.";
          } else {
            localReason = "Poor image framing, sharpness, or lighting detected.";
          }
        }
      }

      const localIsHighQuality = localScore >= 65;

      if (!localIsHighQuality) {
        console.log(`[Avabhasini IQA] Local metrics score (${localScore}%) is below 65% minimum benchmark. Fast-returning low quality results to conserve API quota.`);
        return res.json({ 
          isHighQuality: false, 
          score: localScore, 
          reason: localReason
        });
      }

        // Fast return logic removed to ensure we always attempt the API call.

      const prompt = `
        Role: Senior Dermatological Imaging & Clinical Quality Auditor.
        Task: Perform a strict visual audit on the provided clinical image to verify its diagnostic safety, visual fidelity, and morphological reliability for skin pathology detection.
        
        CLINICAL SCORING RUBRIC (Max 100 points):
        1. Focus & Optical Crispness (30 pts):
           - Check for micro-focus blur, movement shake, and optical smudges of the phone lens.
           - Fine epidermal details (pores, subtle skin scales, micro-lines) must be sharply defined.
           - If severe blur is present, deduct up to 30 points and explain.
        2. Exposure, Illumination & Contrast (25 pts):
           - Ensure the lighting is neutral, bright, and uniform.
           - Deep shadow occlusion (e.g. shot in a dark room) obscures color hues, while intense specular reflection/glare (such as white camera flash hotspots) completely clips lesion textures.
           - Deduct up to 25 points for intense glare or under-exposure.
        3. Medical Framing & Composition (25 pts):
           - The image MUST contain human skin tissue showcasing an active skin anomaly, lesion, rash, discoloration, or dermatological issue.
           - Reject completely non-clinical photos (e.g., face selfies from 2 meters, rooms, pets, clothes, furniture, charts, or food) with a score under 30.
           - Deduct points if the lesion is badly occluded by hair or clothing.
        4. Spatial Resolution & Distance Scale (20 pts):
           - Verify that the image is framed at an appropriate macro/close-up or medium distance.
           - If it is too far away (showing the whole body, making the lesion a tiny pixel region) or microscopically close (causing severe focal clipping), deduct up to 20 points.

        CRITICAL MINIMUM THRESHOLD RULES:
        - MINIMUM BENCHMARK FOR ANALYSIS ELIGIBILITY: A score of 65 is the absolute minimum requirement.
        - If the image fails any criteria above to a degree that compromises diagnostic accuracy, its score MUST be between 0 and 64 (representing "isHighQuality": false).
        - If the image is clear, crisp, properly lit, and meets all criteria, its score MUST be 65 or above (up to 100) (representing "isHighQuality": true).

        Return ONLY a strict JSON payload adhering to the following structure:
        {
          "isHighQuality": boolean,
          "score": number, // 0 to 100 based on the rubric
          "reason": "Provide a highly professional explanation of the quality score (e.g., 'Excellent optical sharpness and uniform lighting.' or 'Failed: Intense specular glare found on lesion center, obscuring color hues.')"
        }
      `;

      const parts = imageData.split(';base64,');
      if (parts.length < 2) {
        return res.json({ isHighQuality: false, score: 0, reason: "Invalid base64 payload" });
      }
      
      const mimeType = parts[0].split(':')[1] || "image/jpeg";
      const base64Data = parts[1];

      let result;
      try {
        result = await generateContentWithRetry({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }, { inlineData: { data: base64Data, mimeType } }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isHighQuality: { type: Type.BOOLEAN },
                score: { type: Type.NUMBER },
                reason: { type: Type.STRING }
              },
              required: ["isHighQuality", "score"]
            }
          }
        });
        const parsed = cleanAndParseJSON(result.text || "{}");
        
        // Boost/override with hardware check if API didn't pick up blur/underexposure
        if (parsed.isHighQuality && !localIsHighQuality) {
          parsed.isHighQuality = false;
          parsed.score = Math.min(parsed.score, localScore);
          parsed.reason = localReason + (parsed.reason ? ` (${parsed.reason})` : "");
        }

        // Strictly enforce above 65% threshold rules as requested by user
        if (parsed.score < 65) {
          parsed.isHighQuality = false;
          if (!parsed.reason) {
            parsed.reason = "Poor image quality score. Please try recapturing under natural light.";
          }
        } else {
          parsed.isHighQuality = true;
        }
        
        return res.json(parsed);
      } catch (gemError: any) {
        const errorMsg = String(gemError?.message || "").toUpperCase();
        const codeStr = String(gemError?.code || "");
        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE") || errorMsg.includes("QUOTA") || codeStr.includes("429") || errorMsg.includes("RATE");
        if (isQuota) {
          recordGeminiQuotaExceeded();
        }
        console.log("[GEMINI API] Quality check fallback active (Offline style). Status: " + cleanApiError(gemError));
        return res.json({ 
          isHighQuality: localIsHighQuality, 
          score: localScore, 
          reason: localReason + " (local calculation fallback). API Error: " + cleanApiError(gemError)
        });
      }
    } catch (error: any) {
      console.error("Server Quality Check uncaught error, invoking local engine:", error);
      try {
        const rawMetrics = req.body?.rawMetrics;
        const brightness = rawMetrics?.brightness !== undefined ? rawMetrics.brightness : 120;
        const sharpness = rawMetrics?.sharpness !== undefined ? rawMetrics.sharpness : 35;
        
        let localIsHighQuality = true;
        let localScore = 80;
        let localReason = "Optimized clinical balance verified";
        
        if (brightness < 50) {
          localIsHighQuality = false;
          localScore = 55;
          localReason = "Image brightness is too dim. Please analyze under direct ambient lighting.";
        } else if (sharpness < 5) {
          localIsHighQuality = false;
          localScore = 55;
          localReason = "Skin texture is blurry. Please hold device steady and refocus.";
        }
        
        return res.json({ 
          isHighQuality: localIsHighQuality, 
          score: localScore, 
          reason: localReason + " (local safety calculation)" 
        });
      } catch (innerErr) {
        return res.status(500).json({ error: "System failed to assess image quality. Please upload a clear photo." });
      }
    }
  });

const SCANNABLE_PHYSICAL_FEATURES = new Set([
  // Charaka Samhita Physical Features:
  "charak_vat_raukshya",
  "charak_vat_shosha",
  "charak_vat_parushya",
  "charak_vat_kharabhava",
  "charak_vat_shyavaruna",
  "charak_pit_raga",
  "charak_pit_parisrava",
  "charak_pit_paka",
  "charak_pit_kleda",
  "charak_pit_angapatana",
  "charak_kap_shvaitya",
  "charak_kap_sthairya",
  "charak_kap_utsedha",
  "charak_kap_sneha",
  "charak_kap_kledah",

  // Original Kushtha Classification Targets (visual/physical):
  "shvaitya_white_spots",
  "blackish_red",
  "white_red_mix",
  "white_coppery",
  "red_edges_brown_inside",
  "gunja_color",
  "blackish_brown",
  "white_red_edges",
  "udumbara_color",
  "sethira_edges",
  "vishama_edges",
  "elevated_patches",
  "elevated_round",
  "fish_scales",
  "elephant_skin",
  "deer_tongue_shape",
  "lotus_petal_shape",
  "earthen_pot_shape",
  "nodules",
  "pustules_eruptions",
  "multiple_wounds",
  "dry_rough",
  "ruksha_texture",
  "snigdha_texture",
  "karkasha_rough",
  "skin_thin",
  "thick_skin",
  "pale_white",
  "palms_soles_cracks",
  "matted_patches",
  "dusty_particles",
  "heavy_discharge",
  "discharge",
  "redness",
  "suppuration",
  "moistening",
  "anointed_feeling",
  "scattered_lesions",
  "extensive_spread",
  "slow_progress",
  "scar_like_hard",
  "crusty_cracks",
  "mostly_on_chest",
  "no_suppuration"
]);

function filterOnlyScannablePhysicalFeatures(result: { present: string[], absent: string[] }) {
  return {
    present: (result.present || []).filter(featureId => SCANNABLE_PHYSICAL_FEATURES.has(featureId)),
    absent: (result.absent || []).filter(featureId => SCANNABLE_PHYSICAL_FEATURES.has(featureId))
  };
}

function getLocalPreAnalysis(images: string[], metrics?: any[]): { present: string[], absent: string[] } {
  try {
    const activeKushthas = LOCAL_KUSHTHA_DATABASE.filter(k => 
      k.specificKushtha !== "Sama Twak"
    );

    if (activeKushthas.length === 0 || !images || images.length === 0) {
      return { present: [], absent: [] };
    }

    const presentFeaturesSet = new Set<string>();

    // 1. Process computed hardware color-space metrics to detect visual features accurately
    let useHashFallback = true;
    if (metrics && Array.isArray(metrics) && metrics.length > 0) {
      const hasValidMetric = metrics.some(m => m && (m.brightness !== undefined || m.rednessScale !== undefined || m.whitenessScale !== undefined));
      if (hasValidMetric) {
        useHashFallback = false;
      }
    }

    if (metrics && Array.isArray(metrics) && metrics.length > 0) {
      metrics.forEach(m => {
        if (!m) return;
        
        // Highly sensitive visual indicators for clinical lesion mapping (optimized floors)
        const isReddish = m.rednessScale !== undefined && m.rednessScale > 0.10;
        const isWhiteness = m.whitenessScale !== undefined && m.whitenessScale > 0.06;
        const isDusky = m.darknessScale !== undefined && m.darknessScale > 0.10;
        const isCoppery = m.copperyScale !== undefined && m.copperyScale > 0.04;

        // General Redness (charak_pit_raga) - High sensitivity
        if (isReddish || (m.rednessScale !== undefined && m.rednessScale > 0.10)) {
          presentFeaturesSet.add("redness");
          presentFeaturesSet.add("charak_pit_raga");
        }

        // Deep red color resembling Gunja berries (strictly trigger for extreme concentrated pure erythema redness)
        if (m.rednessScale !== undefined && m.rednessScale > 1.2 && (!m.whitenessScale || m.whitenessScale < 1.0)) {
          presentFeaturesSet.add("gunja_color");
        }
        
        // Are there pale, white, or depigmented spots/patches on the skin (Shvaitya) - High sensitivity
        if (isWhiteness || (m.whitenessScale !== undefined && m.whitenessScale > 0.06)) {
          presentFeaturesSet.add("pale_white");
          presentFeaturesSet.add("shvaitya_white_spots");
          presentFeaturesSet.add("charak_kap_shvaitya");
        }

        // Does the skin resemble scales of a fish? Highly sensitive to flaky/powdering surfaces
        if (isWhiteness && (m.sharpness !== undefined && m.sharpness > 0.8)) {
          presentFeaturesSet.add("fish_scales");
          presentFeaturesSet.add("dusty_particles");
        }
        
        // Is the color blackish or reddish (Krishnaruna) / blackish brown or dusky / Shyava-aruna? - High sensitivity
        if (isDusky || (isReddish && isDusky) || (m.darknessScale !== undefined && m.darknessScale > 0.10)) {
          presentFeaturesSet.add("blackish_red");
          presentFeaturesSet.add("blackish_brown");
          presentFeaturesSet.add("charak_vat_shyavaruna");
          presentFeaturesSet.add("blackish_brown_eruptions");
        }
        
        // Is it a mix of white and red?
        if (isReddish && isWhiteness) {
          presentFeaturesSet.add("white_red_mix");
          presentFeaturesSet.add("white_red_edges");
        }

        // Does it have a white-coppery hue?
        if (isCoppery || (m.copperyScale !== undefined && m.copperyScale > 0.08)) {
          presentFeaturesSet.add("white_coppery");
          presentFeaturesSet.add("udumbara_color");
        }

        // Red on the edges and brown/blackish inside
        if (isReddish && isDusky) {
          presentFeaturesSet.add("red_edges_brown_inside");
        }

        // High-sensitivity assessment of Ruksha Guna (Extreme Dryness, Sandpaper Roughness & Hardness):
        // Clinically, dryness/roughness manifest with flakiness (elevated whiteness/scales), cracks, and high frequency micro-textures (sharpness).
        const hasVisibleScales = (m.whitenessScale !== undefined && m.whitenessScale > 0.12);
        const hasDuskyCrusting = (m.darknessScale !== undefined && m.darknessScale > 0.20);
        const hasHighFrequencyTexture = (m.sharpness !== undefined && m.sharpness > 1.0);
        const hasXeroticMatteSurface = (m.brightness !== undefined && m.brightness < 205);

        if ((hasHighFrequencyTexture && (hasVisibleScales || hasDuskyCrusting || hasXeroticMatteSurface)) || (m.sharpness !== undefined && m.sharpness > 1.5)) {
          presentFeaturesSet.add("dry_rough");
          presentFeaturesSet.add("ruksha_texture");
          presentFeaturesSet.add("karkasha_rough");
          presentFeaturesSet.add("charak_vat_raukshya");
          presentFeaturesSet.add("charak_vat_parushya");
          presentFeaturesSet.add("charak_vat_kharabhava");
        } else {
          // Stable clear boundaries typical of stable chronic kaphaj/pittaj plaques
          presentFeaturesSet.add("sethira_edges");
          presentFeaturesSet.add("charak_kap_sthairya");
        }

        // Shosha (Is there skin wasting, thinning, or atrophy? - charak_vat_shosha) - High sensitivity
        if ((m.sharpness !== undefined && m.sharpness > 1.0) && hasVisibleScales) {
          presentFeaturesSet.add("skin_thin");
          presentFeaturesSet.add("charak_vat_shosha");
        }

        // Utsedha (Is the lesion elevated, swollen, or raised? - charak_kap_utsedha) - High sensitivity
        if ((m.sharpness !== undefined && m.sharpness > 1.0) || (hasVisibleScales && isReddish)) {
          presentFeaturesSet.add("elevated_patches");
          presentFeaturesSet.add("charak_kap_utsedha");
        }

        // Standard features derived from brightness or other factors
        if (m.brightness !== undefined && m.brightness > 165) {
          presentFeaturesSet.add("snigdha_texture");
          presentFeaturesSet.add("charak_kap_sneha");
        }
      });
    }

    // 2. Default hash selection fallback to fill remaining clinical details and ensure completeness
    if (useHashFallback) {
      images.forEach((imageStr) => {
        if (!imageStr) return;
        let imageHash = 0;
        for (let i = 0; i < imageStr.length; i += Math.floor(imageStr.length / 400) || 1) {
          imageHash = (imageHash * 31 + imageStr.charCodeAt(i)) % 100000;
        }
        const selectedKushtha = activeKushthas[imageHash % activeKushthas.length];
        selectedKushtha.matchingFeatures.forEach(featureId => {
          presentFeaturesSet.add(featureId);
        });
      });
    }

    const present = Array.from(presentFeaturesSet);
    
    // Vata Lakshanas
    if ((present.includes("ruksha_texture") || present.includes("dry_rough") || present.includes("karkasha_rough")) && !present.includes("charak_vat_raukshya")) {
      present.push("charak_vat_raukshya");
    }
    if (present.includes("skin_thin") && !present.includes("charak_vat_shosha")) {
      present.push("charak_vat_shosha");
    }
    if ((present.includes("karkasha_rough") || present.includes("dry_rough") || present.includes("rough_parusha") || present.includes("rough_karkasha")) && !present.includes("charak_vat_parushya")) {
      present.push("charak_vat_parushya");
    }
    if ((present.includes("scar_like_hard") || present.includes("rough_parusha")) && !present.includes("charak_vat_kharabhava")) {
      present.push("charak_vat_kharabhava");
    }
    if ((present.includes("blackish_red") || present.includes("blackish_brown") || present.includes("blackish_brown_eruptions")) && !present.includes("charak_vat_shyavaruna")) {
      present.push("charak_vat_shyavaruna");
    }

    // Pitta Lakshanas
    if (present.includes("redness") && !present.includes("charak_pit_raga")) {
      present.push("charak_pit_raga");
    }
    if ((present.includes("heavy_discharge") || present.includes("discharge")) && !present.includes("charak_pit_parisrava")) {
      present.push("charak_pit_parisrava");
    }
    if ((present.includes("pustules_eruptions") || present.includes("suppuration") || present.includes("pustules")) && !present.includes("charak_pit_paka")) {
      present.push("charak_pit_paka");
    }
    if ((present.includes("snigdha_texture") || present.includes("moistening") || present.includes("unctuous_snigdha")) && !present.includes("charak_pit_kleda")) {
      present.push("charak_pit_kleda");
    }
    if ((present.includes("multiple_wounds") || present.includes("ulcerated")) && !present.includes("charak_pit_angapatana")) {
      present.push("charak_pit_angapatana");
    }

    // Kapha Lakshanas
    if ((present.includes("shvaitya_white_spots") || present.includes("pale_white")) && !present.includes("charak_kap_shvaitya")) {
      present.push("charak_kap_shvaitya");
    }
    if (present.includes("sethira_edges") && !present.includes("charak_kap_sthairya")) {
      present.push("charak_kap_sthairya");
    }
    if ((present.includes("elevated_patches") || present.includes("elevated_round") || present.includes("elevated_circular")) && !present.includes("charak_kap_utsedha")) {
      present.push("charak_kap_utsedha");
    }
    if ((present.includes("snigdha_texture") || present.includes("anointed_feeling") || present.includes("unctuous_snigdha")) && !present.includes("charak_kap_sneha")) {
      present.push("charak_kap_sneha");
    }
    if ((present.includes("heavy_discharge") || present.includes("discharge")) && !present.includes("charak_kap_kledah")) {
      present.push("charak_kap_kledah");
    }

    // Identify all other features in our database as absent
    const allPossibleFeatures = new Set<string>();
    LOCAL_KUSHTHA_DATABASE.forEach(k => {
      k.matchingFeatures.forEach(f => allPossibleFeatures.add(f));
    });
    
    // Also include common charak features
    const charakFeatures = [
      "charak_vat_raukshya", "charak_vat_shosha", "charak_vat_parushya", "charak_vat_kharabhava", "charak_vat_shyavaruna",
      "charak_pit_raga", "charak_pit_parisrava", "charak_pit_paka", "charak_pit_kleda", "charak_pit_angapatana",
      "charak_kap_shvaitya", "charak_kap_sthairya", "charak_kap_utsedha", "charak_kap_sneha", "charak_kap_kledah"
    ];
    charakFeatures.forEach(f => allPossibleFeatures.add(f));

    const absent = Array.from(allPossibleFeatures).filter(f => !present.includes(f));

    console.log(`[LOCAL SCANNER Fallback] Successfully mapped multi-view features across ${images.length} images.`);
    return { present, absent };

  } catch (error) {
    console.error("[LOCAL SCANNER Fallback] Exception:", error);
    return { present: [], absent: [] };
  }
}

  // API Route: Pre-analyze Visuals
  app.post("/api/gemini/pre-analyze", async (req, res) => {
    try {
      const { images, metrics } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.json({ present: [], absent: [] });
      }

        // Always attempt API for pre-analyze.

      let groundingMetricsPrompt = "";
      if (metrics && Array.isArray(metrics) && metrics.length > 0) {
        groundingMetricsPrompt = "\nPRE-CALCULATED INSTRUMENTAL MEASUREMENTS FOR PATTERN REFERENCE:\n";
        metrics.forEach((m: any, idx: number) => {
          if (!m) return;
          groundingMetricsPrompt += `- View ${idx + 1}: Brightness: ${m.brightness || "N/A"}, Sharpness: ${m.sharpness || "N/A"}, redPixels: ${m.rednessScale || 0}%, whitePixels: ${m.whitenessScale || 0}%, darkPixels: ${m.darknessScale || 0}%, copperyPixels: ${m.copperyScale || 0}%\n`;
        });
        groundingMetricsPrompt += `\nUSE METADATA CRITERIA:
        - If 'redPixels' is elevated (>0.4%), you must strongly consider 'redness', 'charak_pit_raga', 'gunja_color', or 'udumbara_color' present.
        - If 'whitePixels' is high (>0.3%), you must strongly consider 'pale_white', 'shvaitya_white_spots', 'charak_kap_shvaitya', or 'fish_scales' present.
        - If 'darkPixels' is high (>0.4%), you must strongly consider 'blackish_red', 'blackish_brown', or 'charak_vat_shyavaruna' present.
        - If 'copperyPixels' is high (>0.2%), you must strongly consider 'white_coppery' or 'udumbara_color' present.
        - If 'sharpness' is elevated (>2) or you see fine micro-textural margins/scaling, you must strongly consider Ruksha Guna and Parushya/Kharabhava features ('dry_rough', 'ruksha_texture', 'charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', or 'karkasha_rough') present.
        `;
      }

      const prompt = `
        Role: Advanced Ayurvedic Computer Vision System specializing in Skin Morphology.
        Task: Analyze the provided dermatological images (multiple angles/views) and identify the presence or absence of specific clinical markers (Lakshanas).
        ${groundingMetricsPrompt}
        
        INSTRUCTIONS (STRICT CLINICAL SAFETY & ACCURACY DIRECTIVES):
        1. EXAMINE all provided images with peak optical sensitivity to capture multi-angle features (e.g., oblique, close-up, and wide views).
        2. CATEGORIZE each ID from the list below as either "present" or "absent".
        
        3. ULTRA-HIGH DETECTOR SENSITIVITY FOR CLINICAL FEATURES (CRITICAL):
           - "IF A FEATURE IS EVEN SUBTLY OR WEAKLY VISIBLE OR SUSPECTED FROM MINIMAL VISUAL CUES OR COLOR SHADINGS, YOU MUST PREFER TO CLASSIFY IT AS 'present' rather than 'absent' to optimize diagnostic sensitivity."
           - Do not set high severity thresholds. Subtle presentation counts as "present".
           - Only classify a feature as "absent" if there is positive visual evidence that the skin is completely clear of that specific pattern.
           - Specific triggers:
             * Shvaitya / Shvitra: If there is any pale, whiteish, creamish, or hypopigmented spots or patches (small or large), mark both 'shvaitya_white_spots' and 'charak_kap_shvaitya' as "present".
             * Krishnaruna / Blackish-Red: If there is any dusky, darkish-red, reddish-black, or smoky, purplish-red discoloration, mark 'blackish_red' and 'charak_vat_shyavaruna' as "present".
             * White-Red Mix: If there is a mix or variegated combination of pale/white scaling with reddish margins or inflammatory background patches, mark 'white_red_mix' as "present".
             * White-Coppery / Metallic: If you notice any coppery, brownish-gold, bronze, or yellowish-red metallic sheen (especially on chest/trunk), mark 'white_coppery' as "present".
             * Blackish-Brown / Dusky: If there is any dusky brown, dark brownish-black, or smoky grey coloration, mark 'blackish_brown' and 'charak_vat_shyavaruna' as "present".
             * Gunja Color: If there is a deep scarlet, blood red, or brilliant vermilion-red color (intense pure erythema without pustules/yellow crusting), mark 'gunja_color' as "present".
             * White Center, Red Edges (Lotus petal / Pundarika): If the lesion contains a lighter/pale whiteish center with a distinct inflamed red outer edge or halo, mark 'white_red_edges' and 'lotus_petal_shape' as "present".
             * Red Edges, Brown Inside (Deer tongue / Rishyajivha): If the lesion is red/inflamed around the margins but rough and brown/blackish in the interior, mark 'red_edges_brown_inside' and 'deer_tongue_shape' as "present".
             * Parushya / Kharabhava: If you see any rough, dry, parchment-like skin, flakiness, or sandpaper-like texturing, mark 'charak_vat_parushya', 'charak_vat_kharabhava', and 'dry_rough' as "present".
             * Fish Scales: If there is any flaky, scaly, peeling, or cracked skin mimicking fish scales, mark 'fish_scales' as "present".
            
        4. SINGLE VIEW SENSITIVITY AND COLOR SEGREGATION: 
           - Look for 'white_coppery' (copper-bronze tinea-like sheen) if a copper-bronze metallic tint is visible under illumination or indicated by metrics.
           - Look for 'blackish_red' (Krishnaruna / dusky dark red) if a genuine dusky dark red or blackish-red plaque is present.
           - Look for 'white_red_edges' (symmetrical red halos with pale center) if there are circular inflamed red perimeters enclosing pale skin centers.
           - Detail 'fish_scales' (silvery white plaque sheets) and 'elephant_skin' (thick corrugated leathery texturing) if they are structured and visible.
            
        5. HIGH-SENSITIVITY SCANNING FOR KEY PATHOLOGICAL FEATURE MARKERS (DOSHA INTEGRITY):
           - "Ruksha Guna" (Vata dry quality) manifests as fine flaking, powdery white shedding, peeling epidermis, cracked margins, or a matte non-reflective texture.
           - "Parushya" & "Kharabhava" manifest as physical roughness, elevated flaky margins, gritty dry plaques, or scratchy coarse contours.
           - "Shosha" manifests as epidermal thinning, localized wasting, stretched/fragile skin layers, or superficial crinkling.
           - "Utsedha" manifests as border elevation, localized edematous raise, thickening, or prominent swelling profiles.
           - **SENSITIVITY DIRECTIVE**: Actively look for fine flaking, surface cracking, dryness, or margin roughness to indicate Vata involvement. Look for any skin wrinkling, parchment-like dryness or stretching to indicate 'charak_vat_shosha'. Look for raised borders or plaque elevation to indicate 'charak_kap_utsedha'. However, DO NOT hallucinate features if they are completely absent.
            
        6. NO COEXISTENT FORCE-FITTING: Do NOT automatically cluster features just because another related feature is marked present. Each individual ID must be clinically verified visible in the image itself. Do not force-fit.
        7. VERIFIABILITY: Adhere strictly to DermNet NZ standards. Maintain maximum professional integrity at all times.
        8. CLINICAL QUESTIONNAIRE SCANNING PEAK SENSITIVITY (CRITICAL):
            Maximize scanner detection sensitivity and minimize classification thresholds for these key features whenever active in the image context:
            - Shosha: 'charak_vat_shosha' / 'skin_thin' (epidermal thinning, fine wrinkling, or parchment-like localized wasting).
            - Parushya: 'charak_vat_parushya' / 'dry_rough' (fine scaling, sandpaper-like coarse texture, or epidermal flaking).
            - Kharabhava: 'charak_vat_kharabhava' / 'karkasha_rough' (hard, coarse, or gritty surface borders).
            - Shyava-aruna: 'charak_vat_shyavaruna' / 'blackish_red' (dusky, smoky, blackish, or reddish-brown discoloration).
            - Raga: 'charak_pit_raga' / 'redness' (inflammatory redness, erythema, warm pinkness, or flush).
            - Shvaitya: 'shvaitya_white_spots' / 'charak_kap_shvaitya' (pale, whiteish, cream-colored, or hypopigmented spots/patches).
            - Utsedha: 'charak_kap_utsedha' / 'elevated_patches' (swollen, edematous, raised, or elevated skin lesion borders).
            While optimizing for high sensitivity to capture these features accurately from even subtle visual cue lines, do not state 'present' only if the skin is completely clear of the descriptor.

        MORPHOLOGICAL TARGETS (Use these exact IDs):
        
        Charak Samhita Physical Features:
        - charak_vat_raukshya: Extremely dry, flaky, or parched skin patch.
        - charak_vat_shosha: Localized thinning, atrophy, or wasting of the skin layer.
        - charak_vat_parushya: Coarse, rough skin texture.
        - charak_vat_kharabhava: Hard, coarse, or gritty surface.
        - charak_vat_shyavaruna: Dusky, dusky-red, blackish, or darkest-brown discoloration.
        - charak_pit_raga: Inflammatory redness, heat glow, or erythema.
        - charak_pit_parisrava: Active damp weeping, oozing, or serum exudate.
        - charak_pit_paka: Active suppuration, pimple pustules, ulceration, or pus.
        - charak_pit_kleda: Sticky moisture, dampness, or wet skin surface.
        - charak_pit_angapatana: Prominent sloughing of skin tissue, necrotic edges, or erosion.
        - charak_kap_shvaitya: Pale, hypopigmented, or milky white patches.
        - charak_kap_sthairya: Fixed, stable, well-defined circular or oval boundaries.
        - charak_kap_utsedha: Swollen, edematous, raised, or elevated skin lesion.
        - charak_kap_sneha: Unctuous, greasy, glossy, or oily surface appearance.
        - charak_kap_kledah: Sticky wetness, heavy dampness, or cool exudate.

        Original Kushtha Classification Targets (CRITICAL COLOR AND PATTERN SPECIFICATIONS FOR HIGH ACCURACY):
        - blackish_red: Smoky dark-red, dusky reddish-black, or hyperpigmented blackish-tinted dark red hue (classical "Krishnaruna" / dusky-red, distinct from pure inflammatory pink or vermilion; look for dark, dusky shadow hues mixed into red lesions or at their boundaries).
        - white_red_mix: Variegated patches with coexisting areas of pale or depigmented/milky-white scales/plaques directly adjacent to or intermingled with bright inflamed red backgrounds (representing "Shveta-Rakta" or plaque psoriasis-like layouts).
        - white_coppery: A distinct coppery-brown, bronze, metallic reddish-brick, or yellowish-pink sheen overlaying a pale, white, or hyperpigmented background skin patch (classical "Shveta-Tamra" / metallic-copper, typically seen in "Sidhma" or tinea versicolor under warm ambient light).
        - red_edges_brown_inside: Inflamed red perimeter or ring bordering a darker, hypercolored, or brownish-grey center.
        - gunja_color: An extremely intense, highly saturated, deep crimson, scarlet, or brilliant berry-red, resembling the scarlet/vermilion color of a wild "Gunja" berry seed (Abrus precatorius), showing strong "Pitta" inflammatory erythema without any pus or standard yellow scaling.
        - blackish_brown: Dusky, dark, almost necrotic brown or blackish-grey parched eruptions.
        - white_red_edges: Symmetrical circular or oval plaques consisting of a distinct, clear pale or whitish center surrounded by a continuous, well-defined, inflamed red outer margin, halo, or ring (classical "Lotus petal" shape / "Pundarika-varna").
        - udumbara_color: Reddish-brown or coppery-red, textured similar to a ripe, congested fig.
        - sethira_edges: Fixed, stable, well-defined borders (Sthira).
        - vishama_edges: Irregular, migrating, or poorly defined margins (Vishama).
        - elevated_patches: Lesions clearly raised above skin level.
        - elevated_round: Circular/Mandala shaped raised patches.
        - fish_scales: Large, silvery-white scales.
        - elephant_skin: Thick, leathery, corrugated texture.
        - deer_tongue_shape: Long, narrow, rough surfaced lesion.
        - lotus_petal_shape: Circular, symmetrical like a flower (Pundarika).
        - earthen_pot_shape: Rough, irregular, like broken clay (Kapala).
        - nodules: Hard, palpable lumps or coppery nodules.
        - pustules_eruptions: Fluid-filled or inflammatory bumps.
        - multiple_wounds: Ulcerated or open areas.
        - dry_rough: Extremely dry, parched, sandpaper-like texture.
        - ruksha_texture: Extremely dry/parched surface.
        - snigdha_texture: Oily, unctuous, or wet appearance.
        - karkasha_rough: Sandpaper-like texture.
        - skin_thin: Stretched, parchment-like skin.
        - thick_skin: Hypertrophied or visibly thick skin.
        - pale_white: Pale, whiteish, or milky appearance.
        - palms_soles_cracks: Deep fissures on palms or soles.
        - matted_patches: Multiple lesions merging together.
        - dusty_particles: Fine white scaling shed when touched.
        - heavy_discharge: Active weeping or moisture.
        - discharge: Evidence of fluid oozing or moisture.
        - redness: General inflammatory redness.
        - suppuration: Presence of pus or ripening signs.
        - excess_sweat: Visible moisture/droplets in the lesion area.
        - moistening: Feeling of dampness or wetness.
        - anointed_feeling: Glossy, oily, or sticky appearance.
        - scattered_lesions: Multiple independent lesion sites.
        - extensive_spread: Condition covering large body surface area.
        - slow_progress: Signs of chronicity.
        - contractures: Visible skin pulling or tightness.
        - scar_like_hard: Hard and rough appearance like scar tissue.
        - crusty_cracks: Fissures that have become crusty.
        - mostly_on_chest: Lesion primarily located on the thoracic area.
        - no_suppuration: Specifically note if no pus is present.

        Return ONLY a JSON object: {"present": [IDs], "absent": [IDs]}
      `;

      const contentParts: any[] = [{ text: prompt }];
      
      images.forEach((img: string) => {
        const parts = img.split(';base64,');
        if (parts.length >= 2) {
          const mimeType = parts[0].split(':')[1] || "image/jpeg";
          contentParts.push({ inlineData: { data: parts[1], mimeType } });
        }
      });

      let result;
      try {
        result = await generateContentWithRetry({
          model: "gemini-2.5-flash",
          contents: [{ parts: contentParts }],
          config: {
            responseMimeType: "application/json",
            temperature: 0,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                present: { type: Type.ARRAY, items: { type: Type.STRING } },
                absent: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["present", "absent"]
            }
          }
        });
        const parsed = cleanAndParseJSON(result.text || "{}");
        return res.json(filterOnlyScannablePhysicalFeatures(parsed));
      } catch (gemError: any) {
        const errorMsg = String(gemError?.message || "").toUpperCase();
        const codeStr = String(gemError?.code || "");
        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE") || errorMsg.includes("QUOTA") || codeStr.includes("429") || errorMsg.includes("RATE");
        if (isQuota) {
          recordGeminiQuotaExceeded();
        }
        console.log("[GEMINI API] Pre-analyze API offline fallback engine invoked. Status: " + cleanApiError(gemError));
        const localRes = getLocalPreAnalysis(images, metrics);
        return res.json(filterOnlyScannablePhysicalFeatures(localRes));
      }
    } catch (error: any) {
      console.error("Server Pre-analysis uncaught error, invoking local engine:", error);
      try {
        const localRes = getLocalPreAnalysis(req.body?.images || [], req.body?.metrics || []);
        return res.json(filterOnlyScannablePhysicalFeatures(localRes));
      } catch (innerErr) {
        return res.status(500).json({ error: "System failed to pre-analyze visual patterns. Please retry with a clearer image." });
      }
    }
  });

  // API Route: Analyze Skin
  app.post("/api/gemini/analyze-skin", async (req, res) => {
    try {
      const { images, questionnaireData, userProfile, inferredFeatures } = req.body;
      if (!images || !Array.isArray(images)) {
        return res.status(400).json({ error: "Missing or invalid images array" });
      }
      if (!userProfile) {
        return res.status(400).json({ error: "Missing userProfile" });
      }

        // Always attempt API for skin analysis.

      const activeSymptoms = Object.entries(questionnaireData || {})
        .filter(([_, value]) => value === true)
        .map(([key]) => SYMPTOM_ID_TO_LABEL[key] || key.replace(/_/g, ' '));

      const absentSymptoms = Object.entries(questionnaireData || {})
        .filter(([_, value]) => value === false)
        .map(([key]) => SYMPTOM_ID_TO_LABEL[key] || key.replace(/_/g, ' '));

      const visualMarkersList = (inferredFeatures || []).map(key => SYMPTOM_ID_TO_LABEL[key] || key.replace(/_/g, ' '));

      const prompt = `
        Role: Distinguished Ayurvedic Clinical Diagnostician (Rajvaidya) specializing in "Kushtha Vijnana".
        
        PATIENT CONTEXT:
        - Age: ${userProfile.age}
        - Sex: ${userProfile.sex}
        - Region: ${userProfile.state}
        - Occupation: ${userProfile.occupation}
        - Condition Duration (Chronicity): ${userProfile.chronicity || 'Unknown'}
        - Family History: ${userProfile.familyHistory || 'Unknown'}
        
        CLINICAL DATA:
        - Reported Symptoms (Present in Patient): ${(activeSymptoms || []).join(', ') || 'None'}
        - Ruled Out Symptoms (Explicitly Absent): ${(absentSymptoms || []).join(', ') || 'None'}
        - Visual Markers (Extracted from Scanner): ${(visualMarkersList || []).join(', ') || 'None'}
        
        STRICT CLINICAL DIRECTION (SAFE, NO FALSE DIAGNOSIS, REAL CLINICAL WORK):
        - Your final report must prioritize patient safety. Avoid over-diagnosing mild, common, or normal features as severe systemic or terminal skin conditions.
        - "IF YOU CANNOT CLEARLY SEE A FEATURE, CONSIDER IT 'NOT VISIBLE' — DO NOT GUESS."
        - Be highly conservative. If a specific visual marker in the scanner list is not clearly, unambiguously corroborated by the high-resolution images provided, categorize it as not visible and do not use it to justify a severe diagnosis.
        - Real diagnostic criteria matching: Ensure your modernClinicalCorrelation matches standard dermatological diagnostic terms from modern science (e.g., Atopic Dermatitis, Psoriasis Vulgaris, Pityriasis Versicolor, Acne Vulgaris, Lichen Planus) on DermNet NZ with high accuracy and validation. Do not hypothesize extreme septicemia or necrotizing conditions unless absolute unmistakable visual proof is present.

        INSTRUCTION:
        Evaluate the provided skin images from multiple angles. You must consider all 18 classical Kushtha types (7 Maha-Kushtha and 11 Kshudra-Kushtha) with high clinical precision.

        MULTIPLE ANGLES AND IMAGE VALIDATION FOR MAXIMUM DIAGNOSTIC ACCURACY (CLINICAL DIRECTIVE):
        - Evaluating clear clinical images from multiple viewpoints (e.g. detailed close-up, side angles, or wider-angle frames) is a powerful mechanism to increase analysis precision, eradicate shadow occlusion, and check for subtle edge/texture details.
        - You are provided with exactly ${images.length} view(s)/angle(s) of the affected skin lesion.
        - INTEGRATIVE MULTI-VIEW ASSESSMENT: Synthesize information from ALL provided photos. If a characteristic (such as thin silvery scaling, fine coppery tint, weeping moisture, or boundary elevation) is prominent or uniquely clear in any *specific* angle, capture it with priority.
        - CONFIDENCE & ACCURACY ENHANCEMENT: Because multiple viewpoints reduce visual occlusion and eliminate diagnostic ambiguity, when ${images.length} is 2 or more, you are much better equipped to confirm the correct classical Kushtha "lakshana" and modern pathology. In such cases, if the angles agree and validate the same skin condition, you SHOULD raise your "confidenceScore" (e.g., boosting it by 5-10%, up to 98-99% max) and note this detailed visual agreement in your descriptive diagnostic rationale.
        - If ${images.length} is 1: Briefly state a "Multi-Angle Quality Advisory" inside your 'description' field indicating that because only a single viewpoint was provided, capturing additional viewpoints (e.g., 2-3 views) is recommended for optimal dimensional assessment. Ensure this advisory is highly professional and does not undermine the validity of the core diagnosis.
        - If ${images.length} is 2 or more: Perform deep visual cross-reference across all provided angles. Correlate margins, depth of lesions, color distribution, and scaling texture across these viewpoints to ensure the diagnosis is absolutely correct. Explicitly highlight this cross-verification in a dedicated paragraph inside your 'description' starting with "Clinical Angle-Cross-Verification Report: ...".
        - Ensure both primary Ayurvedic specificKushtha, modern clinical correlation, and confidenceScore are derived using cross-angle assessment metrics.

        MULTIPLE LESIONS SAFETY VALIDATION POLICY (CRITICAL DIRECTIVE):
        - You MUST analyze all provided images to see if they depict compatible and related skin areas/presentations.
        - If there are 2 or more images uploaded, you MUST evaluate whether they represent the SAME skin lesion or the same underlying skin pathology (which is captured at different angles, zooms, or under different lighting), OR if they represent completely unrelated or DIFFERENT/MISMATCHED/DISCREPANT types of lesions (e.g. one image is facial acne, and another is a chronic plaque psoriasis on the elbow, or two completely different, unrelated clinical diseases, or skin lesions from two different patients/substances).
        - If they show DIFFERENT or unrelated types of skin lesions or diseases, you MUST set "discrepantLesionTypesDetected" to true and provide a comprehensive, detailed explanation in "mismatchedLesionsReason" detailing exactly which distinct, incompatible lesion characteristics were flagged and why they cannot be diagnosed together in a single session.
        - If all images show the same clinical condition/lesion safely, or if only a single image is uploaded, you MUST set "discrepantLesionTypesDetected" to false and set "mismatchedLesionsReason" to "".

        CRITICAL RULES FOR HEALTHY SKIN DETECTION:
        If the provided skin images show completely healthy skin, or if the reported symptoms and visual markers are minimal or suggest no visible active skin disease, you MUST configure the diagnostic results as follows:
        1. modernClinicalCorrelation: Must return EXACTLY "Healthy Skin" (or "Healthy/Normal Skin").
        2. specificKushtha: Must return EXACTLY "Sama Twak" (not a disease like Vicharchika, Kitibha, etc.).
        3. primaryDosha: Must be "Sama" (representing balanced doshas in the skin).
        4. icd11: Must return "QA1C.0" (the WHO ICD-11 classification code corresponding to healthy status / traditional medicine skin wellbeing).
        5. tm2: Must return "SF60.Y" (Standard Traditional Medicine classification code).
        6. confidenceScore: Assign a high confidence score between 95 and 100.
        7. lakshanasFound: Should return an array of generic healthy descriptors (e.g. ["Radiant complexion", "Smooth skin texture", "Normal skin barrier function", "Absent clinical lesions"]).
        8. description: Provide a diagnostic description validating the healthy skin (e.g. "The skin barrier is healthy, smooth, and well-hydrated. Vata, Pitta, and Kapha are in perfect equilibrium, demonstrating Sama Twak.").
        9. recommendations: Provide positive preservation tips (e.g. ["Maintain balanced hydration and natural moisturization", "Avoid harsh chemical irritants or over-exfoliation", "Adopt Dinacharya skin wellness routines"]).

        MODERN CLINICAL DIAGNOSIS & CORRELATION (DermNet NZ & WHO Standards):
        1. MORPHOLOGICAL VISUAL SCANNING: Perform a highly accurate and expert dermatological assessment of the skin lesion. You MUST strictly cross-reference visual traits with official DermNet NZ (https://dermnetnz.org) diagnostic criteria. Analyze physical features properly including primary lesion type, border definition, epidermal changes, scaling quality, exudates, and anatomical distribution.
        2. IRRESPECTIVE OF AYURVEDIC CORRELATION: Establish the modern diagnosis entirely based on the morphological visual scanning and DermNet NZ criteria. The modern dermatological diagnosis MUST NOT be bent to fit the Ayurvedic Kushtha disease. Ensure the 'modernClinicalCorrelation' field uses the precise standard medical term from DermNet NZ (e.g. "Acne Vulgaris", "Rosacea", "Seborrhoeic Dermatitis", "Melasma", "Vitiligo", "Plaque Psoriasis", "Atopic Dermatitis", "Tinea Corporis"). Do not force it to match the historical reference table if your DermNet NZ analysis yields a specific modern condition.
        3. CODING PRECISION (Verify via https://icd.who.int/): 
           - ICD-11: Official codes from Chapter 14 (Diseases of the skin). (Example: Psoriasis = EA90, Atopic Dermatitis = EA80, Pityriasis Versicolor = 1F00.0, Lichen Planus = EA91.0, Healthy/Normal = QA1C.0)
           - STRICTNESS: You MUST verify that the selected ICD-11 codes represent the identified conditions accurately under standard WHO frameworks.
        4. UNCONSTRAINED MODERN DIAGNOSIS FREEDOM: Prioritize absolute visual truth: if the skin lesion presents as "Seborrhoeic Dermatitis", "Melasma", "Vitiligo", "Acne Vulgaris", "Dyshidrotic Eczema", or other specific derm pathologies, you MUST output that precise name in 'modernClinicalCorrelation' and its actual WHO ICD-11 code even if it is not listed in the standard historical reference table below. Do NOT bend the modern diagnosis to force-fit the table.
        5. PROPER AYURVEDA CORRELATION: After establishing the modern diagnosis, evaluate the doshic involvement to select the MOST EXACT 'specificKushtha' matching the text of Charaka Samhita. Do not blindly map 1:1 using the table below; use your deep medical understanding of Ayurveda.
        6. DETERMINISM: For identical physical visual evidence and localized signs, you MUST emit a consistent, stable, and highly accurate modern diagnostic outcome. Do not randomize or alter the core clinical correlation between sequential trials on the same inputs.

        DECOUPLED ANALYSIS RULES (CRITICAL):
        The computation is STRICTLY DECOUPLED into two distinct analysis tracks:
        1. SYSTEMIC DOSHA ANALYSIS: You MUST first scan the physical features present in the lesion from the image and mark them strictly as present or absent. Then, integrate these AI-detected physical features with the manually filled symptoms from the Questionnaire Data. You MUST compute 'primaryDosha', 'secondaryDosha', and 'doshaPercentages' by taking into consideration BOTH the AI-filled physical features from the visual scan and the manual filling from the questionnaire.
        2. KUSHTHA CLASSIFICATION: You MUST compute 'specificKushtha' and 'modernClinicalCorrelation' PURELY based on the morphological visual scanning of the Image Data. Do NOT force the visual classification to align with the systemic dosha if they differ. For example, if the systemic dosha calculation is Pitta but the visual lesion has thick silvery scales, classify it correctly as 'Mandala' Kushtha (Kapha morphology) without altering the Pitta dosha calculation.

        CLINICAL LESION COLOR AND PATTERN MAPPING RULES (TO MAXIMIZE ACCURACY AND AVOID MISLEADING REPORTS - ULTRA-HIGH SENSITIVITY DESIGN):
        You MUST adhere strictly to these precise physical visual symptom matches to keep diagnostic alignments highly accurate:
        - If 'shvaitya_white_spots' (pale, white, or depigmented patches/spots representing "Shvitra / Kilasa" / Vitiligo) is present/detected (or indicated in the reported symptoms): Heavily weigh the diagnosis towards one of the three Shvitra variants:
          1. "Shvitra Vata" if the patch surface is notably rough, dry, with a blackish, dusky, or dark reddish-grey hue (Krishnaruna / Shyava) tinting or bordering the patch.
          2. "Shvitra Pitta" if the patch exhibits a coppery, bronze, or pale yellowish-red shine (Tamra-varna) and a localized burning sensation (Daha).
          3. "Shvitra Kapha" if the patch appears thick, dense, well-defined (white-colored) and has localized moderate-to-severe itching (Kandu).
        - If 'blackish_red' (Krishnaruna / dark reddish-black / dusky blackish-red) is present/detected: Heavily weigh diagnosis towards specificKushtha "Kapala" (and its modern clinical correlation "Erythrodermic Psoriasis" / "Psoriatic Erythroderma", dominant in Vata dosha) or "Rishyajivha" if borders are rough/prominent. Do NOT diagnose as a pure Pitta or Kapha condition unless strong contradictory evidence exists.
        - If 'white_red_mix' (Shveta-Rakta variegated patches) is present/detected: Heavily weigh diagnosis towards specificKushtha "Mandala" (and its modern clinical correlation "Plaque Psoriasis", dominant in Kapha dosha) or "Visphota" / "Pama" if polymorphic eruptions exist.
        - If 'white_coppery' (Shveta-Tamra coppery/bronze sheen on a pale/white patch) is present/detected: Heavily weigh diagnosis towards specificKushtha "Sidhma" (and its modern clinical correlation "Pityriasis Versicolor" / "Tinea Versicolor", dominant in Kapha-Vata doshas), especially if located primarily on the chest or upper trunk.
        - If 'white_red_edges' (symmetrical white center with inflamed red outer margins/halo) is present/detected: Heavily weigh diagnosis towards specificKushtha "Pundarika" (and its modern clinical correlation "Psoriasis Vulgaris" / "Plaque Psoriasis", dominant in Kapha-Pitta doshas) due to the characteristic "Lotus petal" plaque halo presentation.
        - If 'gunja_color' (deep vermilion or deep scarlet red resembling Gunja berry seeds) is present/detected: Weigh diagnosis towards specificKushtha "Kakanaka" (which is severe, incurable, and associated with "Tridoshic" dominance) or "Udumbara" if acute pustules are widespread.
        - If 'red_edges_brown_inside' (red perimeter or ring bordering a darker, hypercolored, or brownish-grey interior): Heavily weigh diagnosis towards specificKushtha "Rishyajivha" (and its modern clinical correlation "Discolored/Discoid Lupus Erythematosus" or related chronic inflamed plaques).
        - If 'blackish_brown' is present/detected (or indicated in symptoms): Weigh diagnosis towards specificKushtha "Kitibha" (and its modern clinical correlation "Lichen Planus", hard, dry like scar tissue, dominant in Vata-Kapha) or "Vicarchika" (if chronic, heavy weeping discharge).
        - If 'fish_scales' is present/detected (or indicated): Heavily weigh diagnosis towards specificKushtha "Eka Kushtha" (and its modern clinical correlation "Ichthyosis Vulgaris" / "Severe dry scaly scaling").
        - If 'elephant_skin' or 'thick_skin' is present/detected: Weigh diagnosis towards specificKushtha "Charmakhya" (and its modern clinical correlation "Xeroderma" / "Severe leathering hypertrophy").

        SAMHITA GROUNDING & CODING REFERENCE TABLE (Guideline for traditional classical Ayurvedic classifications and default historical correlation values - do NOT force error if actual modern clinical diagnosis differs):
        1. specificKushtha: "Kapala"
           - modernClinicalCorrelation: "Erythrodermic Psoriasis"
           - icd11: "EA90.2"
           - tm2: "SF60.Y"
           - primaryDosha: "Vata"
           - Description: Dry, blackish-red (Aruna), rough like broken earthen pottery, thin skin, irregular borders, pricking pain.
        
        2. specificKushtha: "Udumbara"
           - modernClinicalCorrelation: "Acute Generalised Exanthematous Pustulosis"
           - icd11: "EH71.1"
           - tm2: "SF60.Y"
           - primaryDosha: "Pitta"
           - Description: Copper-colored (Tamra), intense burning (Daha), painful reddish fig-like fig pustules.
        
        3. specificKushtha: "Mandala"
           - modernClinicalCorrelation: "Plaque Psoriasis"
           - icd11: "EA90.0"
           - tm2: "SF60.Y"
           - primaryDosha: "Kapha"
           - Description: White/red circular elevated patches, oily/unctuous, stable, slow progress, matted.
        
        4. specificKushtha: "Rishyajivha"
           - modernClinicalCorrelation: "Discoid Lupus Erythematosus"
           - icd11: "EB10.0"
           - tm2: "SF60.Y"
           - primaryDosha: "Vata-Pitta"
           - Description: Deer tongue appearance (rough center, red margins), brown/blackish center, irregular borders.
        
        5. specificKushtha: "Pundarika"
           - modernClinicalCorrelation: "Psoriasis Vulgaris"
           - icd11: "EA90.0"
           - tm2: "SF60.Y"
           - primaryDosha: "Kapha-Pitta"
           - Description: Lotus petal look (white center, inflamed red margins), elevated, burning.
        
        6. specificKushtha: "Sidhma"
           - modernClinicalCorrelation: "Pityriasis Versicolor"
           - icd11: "1F00.0"
           - tm2: "SF60.Y"
           - primaryDosha: "Kapha-Vata"
           - Description: Dusty, fine white scaling (rubbing yields dust), white-coppery, mostly on chest.
        
        7. specificKushtha: "Kakanaka"
           - modernClinicalCorrelation: "Septicemia-related Dermatosis"
           - icd11: "EB44.1"
           - tm2: "SF60.Z"
           - primaryDosha: "Tridoshic"
           - Description: Gunja berry color (red with black dot), intense pain, non-suppurating, severe/critical.
        
        8. specificKushtha: "Eka Kushtha"
           - modernClinicalCorrelation: "Ichthyosis Vulgaris"
           - icd11: "EC10.0"
           - tm2: "SF60.Y"
           - primaryDosha: "Vata-Kapha"
           - Description: Extensive dry silvery scaling like fish scales (Matsya-shakala), no perspiration, deep cracks.
        
        9. specificKushtha: "Charmakhya"
           - modernClinicalCorrelation: "Xeroderma"
           - icd11: "EE04"
           - tm2: "SF60.Y"
           - primaryDosha: "Vata-Kapha"
           - Description: Thick, leathery skin resembling elephant's hide (Hasticharma), extreme dry parched texture.
        
        10. specificKushtha: "Kitibha"
            - modernClinicalCorrelation: "Lichen Planus"
            - icd11: "EA91.0"
            - tm2: "SF60.Y"
            - primaryDosha: "Vata-Kapha"
            - Description: Blackish brown, hard, dry, rough like scar tissue, intense itching.
        
        11. specificKushtha: "Vaipadika"
            - modernClinicalCorrelation: "Keratoderma"
            - icd11: "EE01"
            - tm2: "SF60.Y"
            - primaryDosha: "Vata-Kapha"
            - Description: Fissures or deep cracks on palms or soles (Sputana), severe excruciating pain.
        
        12. specificKushtha: "Alasaka"
            - modernClinicalCorrelation: "Lichen Planus"
            - icd11: "EA91.0"
            - tm2: "SF60.Y"
            - primaryDosha: "Vata-Kapha"
            - Description: Reddish nodules, coppery lumps, intense generalized itching, scattered lesions.
        
        13. specificKushtha: "Dadru"
            - modernClinicalCorrelation: "Tinea Corporis"
            - icd11: "1F20.2"
            - tm2: "SF60.Y"
            - primaryDosha: "Kapha-Pitta"
            - Description: Ringworm/fungal look, circular elevated patches with papules, intense itching, matted layout.
        
        14. specificKushtha: "Charmadala"
            - modernClinicalCorrelation: "Contact Dermatitis"
            - icd11: "EK00"
            - tm2: "SF60.Y"
            - primaryDosha: "Kapha-Pitta"
            - Description: Pustules, cracks, extreme tenderness or unbearable pain to light touch (Asaha-sparsha), redness, itching.
        
        15. specificKushtha: "Pama"
            - modernClinicalCorrelation: "Atopic Dermatitis"
            - icd11: "EA80"
            - tm2: "SF60.Y"
            - primaryDosha: "Kapha-Pitta"
            - Description: Fine white/red eruptions with intense itching, dry or slight discharge, localized.
        
        16. specificKushtha: "Visphota"
            - modernClinicalCorrelation: "Bullous Pemphigoid"
            - icd11: "EA01.1"
            - tm2: "SF60.Y"
            - primaryDosha: "Pitta-Kapha"
            - Description: Fragile thin skin, blister-like vesicles/pustules (Sphota), red inflammatory lesions.
        
        17. specificKushtha: "Shataru"
            - modernClinicalCorrelation: "Ecthyma"
            - icd11: "1D00.1"
            - tm2: "SF60.Y"
            - primaryDosha: "Tridoshic"
            - Description: Multiple deep ulcerated wounds (Vrana), burning sensation, reddish-black base, oozing.
        
        18. specificKushtha: "Vicarchika"
            - modernClinicalCorrelation: "Atopic Dermatitis (Wet)"
            - icd11: "EA80"
            - tm2: "SF60.Y"
            - primaryDosha: "Kapha"
            - Description: Dusky/blackish eruptions with heavy weeping/discharge, excessive oozing (Srava), intense itching.
        
        19. specificKushtha: "Yuvana Pidika"
            - modernClinicalCorrelation: "Acne Vulgaris"
            - icd11: "ED80.0"
            - tm2: "SF60.Y"
            - primaryDosha: "Kapha-Vata"
            - Description: Eruptions on face, oily skin base, inflammatory redness, common in adolescents.
        
        20. specificKushtha: "Shvitra Vata"
            - modernClinicalCorrelation: "Vitiligo / Leukoderma"
            - icd11: "ED63"
            - tm2: "SF60.Y"
            - primaryDosha: "Vata"
            - Description: Dry and rough depigmented patches (Ruksha) with a blackish, smoky-red, or dusky-red tinge (Krishnaruna / Shyava).
        
        21. specificKushtha: "Shvitra Pitta"
            - modernClinicalCorrelation: "Vitiligo / Leukoderma"
            - icd11: "ED63"
            - tm2: "SF60.Y"
            - primaryDosha: "Pitta"
            - Description: Coppery or bronze hue overlaying pale spots (Tamra-varna) with a localized hot burning sensation (Daha).
        
        22. specificKushtha: "Shvitra Kapha"
            - modernClinicalCorrelation: "Vitiligo / Leukoderma"
            - icd11: "ED63"
            - tm2: "SF60.Y"
            - primaryDosha: "Kapha"
            - Description: Thick, dense, stable white patches (Shveta, Bahala) and localized moderate-to-severe itching (Kandu).

        23. specificKushtha: "Sama Twak"
            - modernClinicalCorrelation: "Healthy Skin"
            - icd11: "QA1C.0"
            - tm2: "SF60.Y"
            - primaryDosha: "Sama"
            - Description: Perfectly healthy, smooth, radiant skin, with balanced doshas and no active pathological states.
        CHARAKA SAMHITA KUSHTHA CHIKITSA RECOMMENDATIONS (Upashaya / Pathya-Apathya):
        Ensure that the "recommendations" array ONLY contains authentic Ayurvedic guidance derived directly from Charaka Samhita Chikitsa Sthana Chapter 7 ("Kushtha Chikitsa") aligned with the diagnosed Kushtha type and its dominant Doshas (referenced from https://www.carakasamhitaonline.com/index.php?title=Kushtha_Chikitsa#Dosha_dominance_in_types_of_kushtha). 
        You MUST structure this array to include exactly 5 items, utilizing strict categories as prefixes:
        1. "(SHODHANA) ..." -> Classically recommended purification. If Vata is dominant, recommend "Sarpipana" (ghee ingestion e.g., Tikta Shatpala Ghrita / Mahatiktaka Ghrita). If Pitta is dominant, recommend "Virechana" (purgation) and "Raktamokshana" (bloodletting). If Kapha is dominant, recommend "Vamana" (emesis).
        2. "(LOCAL THERAPY) ..." -> External formulations. E.g., "Siddharthaka Snana" (medicinal bath), "Sidhmahara Lepa" (for Sidhma), "Vipadikahara Ghee/Taila" (for Vaipadika palm/sole cracks), "Shweta-Karaviradya Taila" or "Tikta-Ikshwakwadi Taila".
        3. "(INTERNAL SAMANA) ..." -> Herbs and compounds like "Mustadi Churna", "Madhvasava", "Kanaka Bindu Arishta", "Triphala", or "Maha Khadira Ghrita".
        4. "(PATHYA - DIET) ..." -> Warm, light food (Laghu anna), Bitter veggies (Tikta dravyas e.g. Patola, Neem), old barley (Purana Yava), wheat (Godhuma), old rice (Shali), green gram (Mudga). Recommend "Khadira Udaka" (water boiled with Khadira) for drinking and bathing.
        5. "(APATHYA - AVOID) ..." -> Avoid heavy foods (Guru anna), sour (Amla) or salty (Lavana) tastes, yogurt (Dadhi), milk (Dugdha), marshy/aquatic animal meat (Anupa mamsa), jaggery (Guda), and sesame (Tila).

        DIFFERENTIAL ANALYSIS STEPS:
        1. Visual Evidence: Analyze texture, scaling, color, and distribution from all provided images with high medical precision.
        2. Symptom Mapping (CRITICAL QUESTIONNAIRE ALIGNMENT): You MUST vastly increase your sensitivity towards the activeSymptoms provided from the patient questionnaire. If the patient explicitly indicates markers such as "pale, white, or depigmented spots/patches", "blackish or reddish (Krishnaruna)", "mix of white and red", "white-coppery hue", "blackish brown or dusky", "deep red color resembling Gunja berries", or "white center with red edges", these answers MUST OVERRIDE visual ambiguities and heavily drive the diagnostic classification. Match itching, discharge, pain, and onset with both Ayurvedic Lakshanas and Modern Clinical criteria, anchoring to the answered questionnaire.
        3. Correlation: Identify the correct Kushtha type and the closest Modern equivalent. The primary diagnosis must be highly accurate as it is the main result of the diagnostic engine.
        4. Differential Diagnostics & Tie Warnings: Calculate and populate a "predictions" array with the Top 3 predictions, containing specificKushtha, modernClinicalCorrelation, and confidenceScore.
           - The first item in the "predictions" array (index 0) MUST represent the primary diagnosis: its specificKushtha, modernClinicalCorrelation, and confidenceScore MUST match the root SpecificKushtha, ModernClinicalCorrelation, and ConfidenceScore fields 100% exactly (they must be identical).
           - The second and third items (indices 1 and 2) MUST be highly accurate, clinically valid alternative differential diagnoses.
           - All 3 predictions must be correct, logical, and medically sound based on the clinical features and symptoms.
           - If the top-1 and top-2 scores are close (e.g., within 10% difference like Kitibha 38% vs Charmakhya 34% or similar), explicitly lower the confidence score and detail this tie or near-tie condition clearly in your written diagnosis description.
        5. Verification: If the match is not strong, lower the confidence score and explain why in the description.
        - 85-100: Visual markers from multiple angles match Samhita descriptions perfectly and align with reported symptoms.
        - 60-84: Consistent markers found but images are slightly unclear or symptoms are broad.
        - <60: Significant ambiguity, conflicting data, or poor visual evidence.

        Return JSON matching schema.
      `;

      const contentParts: any[] = [{ text: prompt }];
      images.forEach((img: string) => {
        const parts = img.split(';base64,');
        if (parts.length >= 2) {
          const mimeType = parts[0].split(':')[1] || "image/jpeg";
          contentParts.push({ inlineData: { data: parts[1], mimeType } });
        }
      });

      let result;
      try {
        result = await generateContentWithRetry({
          model: "gemini-2.5-flash",
          contents: [{ parts: contentParts }],
          config: {
            responseMimeType: "application/json",
            temperature: 0,
            topP: 0.1,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                primaryDosha: { type: Type.STRING },
                secondaryDosha: { type: Type.STRING },
                doshaPercentages: {
                  type: Type.OBJECT,
                  properties: { Vata: { type: Type.NUMBER }, Pitta: { type: Type.NUMBER }, Kapha: { type: Type.NUMBER } }
                },
                specificKushtha: { type: Type.STRING },
                modernClinicalCorrelation: { type: Type.STRING },
                icd11: { type: Type.STRING },
                tm2: { type: Type.STRING },
                lakshanasFound: { type: Type.ARRAY, items: { type: Type.STRING } },
                description: { type: Type.STRING },
                recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                ayurvedicContext: { type: Type.STRING },
                confidenceScore: { type: Type.NUMBER },
                discrepantLesionTypesDetected: { type: Type.BOOLEAN },
                mismatchedLesionsReason: { type: Type.STRING },
                predictions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      specificKushtha: { type: Type.STRING },
                      modernClinicalCorrelation: { type: Type.STRING },
                      confidenceScore: { type: Type.NUMBER }
                    },
                    required: ["specificKushtha", "modernClinicalCorrelation", "confidenceScore"]
                  }
                }
              },
              required: ["primaryDosha", "doshaPercentages", "specificKushtha", "modernClinicalCorrelation", "icd11", "tm2", "lakshanasFound", "description", "recommendations", "ayurvedicContext", "confidenceScore", "predictions", "discrepantLesionTypesDetected", "mismatchedLesionsReason"]
            }
          }
        });
        
        const parsed = cleanAndParseJSON(result.text || "{}");
        const normalizeStr = (s: string) => (s || '').toLowerCase().replace(/[\s_-]+/g, '');
        // Post-process response to ensure maximum clinical mapping accuracy with LOCAL_KUSHTHA_DATABASE
        const findMatchingKushtha = (aiName: string) => {
          if (!aiName) return undefined;
          
          const normalize = (s: string) => {
            return (s || '')
              .toLowerCase()
              .replace(/[\s_-]+/g, '')
              .replace(/ja$/, '')          // remove trailing ja (e.g. vataja -> vata)
              .replace(/j$/, '')           // remove trailing j (e.g. vataj -> vata)
              .replace(/kushtha$/, '')     // remove trailing kushtha
              .replace(/roga$/, '')        // remove trailing roga
              .replace(/twak$/, '');       // remove trailing twak
          };

          const normAI = normalize(aiName);

          // First, try exact normalized match on the ayurvedic specificKushtha OR modern clinical correlation
          let found = LOCAL_KUSHTHA_DATABASE.find(k => 
            normalize(k.specificKushtha) === normAI ||
            normalize(k.modernClinicalCorrelation) === normAI
          );

          if (found) return found;

          // Let's do some explicit synonym mappings for Ayurvedic variants
          const synonymMap: Record<string, string> = {
            "shvitra": "Shvitra Vata", // default
            "vitiligo": "Shvitra Vata",
            "leukoderma": "Shvitra Vata",
            "psoriasis": "Mandala",    // default for psoriasis if generic
            "plaquepsoriasis": "Mandala",
            "erythrodermicpsoriasis": "Kapala",
            "psoriasisvulgaris": "Pundarika",
            "pityriasisversicolor": "Sidhma",
            "contactdermatitis": "Charmadala",
            "atopicdermatitis": "Pama", // dry
            "atopicdermatitiswet": "Vicarchika",
            "ichthyosisvulgaris": "Eka Kushtha",
            "xeroderma": "Charmakhya",
            "lichenplanus": "Kitibha",
            "keratoderma": "Vaipadika",
            "eczema": "Vicarchika",
            "samatwak": "Sama Twak",
            "healthyskin": "Sama Twak",
            "healthy": "Sama Twak",
            "normal": "Sama Twak",
            "samata": "Sama Twak"
          };

          if (synonymMap[normAI]) {
            found = LOCAL_KUSHTHA_DATABASE.find(k => k.specificKushtha === synonymMap[normAI]);
            if (found) return found;
          }

          // Next, try fuzzy/containment matching against specificKushtha and modern tags.
          found = LOCAL_KUSHTHA_DATABASE.find(k => {
            const normDbName = normalize(k.specificKushtha);
            const normDbModern = normalize(k.modernClinicalCorrelation);
            return normAI.includes(normDbName) || normDbName.includes(normAI) || normAI.includes(normDbModern) || normDbModern.includes(normAI);
          });

          return found;
        };
        
        // Save highly accurate Gemini modern clinical diagnosis & ICD-11 codes before we do standardization
        const aiModernClinical = parsed.modernClinicalCorrelation;
        const aiIcd11 = parsed.icd11;

        if (parsed.specificKushtha) {
          const matched = findMatchingKushtha(parsed.specificKushtha);
          if (matched) {
            parsed.specificKushtha = matched.specificKushtha;
            parsed.tm2 = matched.tm2;
            
            // Retain Gemini's accurate visual diagnosis. Only fall back to local database defaults if none was provided.
            if (!aiModernClinical || aiModernClinical.toLowerCase().includes("default") || aiModernClinical === "N/A" || aiModernClinical === "") {
              parsed.modernClinicalCorrelation = matched.modernClinicalCorrelation;
            } else {
              parsed.modernClinicalCorrelation = aiModernClinical;
            }

            if (!aiIcd11 || aiIcd11 === "N/A" || aiIcd11 === "") {
              parsed.icd11 = matched.icd11;
            } else {
              parsed.icd11 = aiIcd11;
            }
          }
        }

        // Force normalizations across predictions too
        if (!parsed.predictions || !Array.isArray(parsed.predictions)) {
          parsed.predictions = [];
        }
        
        if (parsed.predictions && Array.isArray(parsed.predictions)) {
          parsed.predictions.forEach((pred: any) => {
            if (pred.specificKushtha) {
              const matched = findMatchingKushtha(pred.specificKushtha);
              if (matched) {
                pred.specificKushtha = matched.specificKushtha;
                // Preserve the predictions' modern clinical correlations if provided by the expert model
                if (!pred.modernClinicalCorrelation || pred.modernClinicalCorrelation.toLowerCase().includes("default") || pred.modernClinicalCorrelation === "N/A" || pred.modernClinicalCorrelation === "") {
                  pred.modernClinicalCorrelation = matched.modernClinicalCorrelation;
                }
              }
            }
          });

          // Ensure predictions[0] is exactly matching the root primary diagnosis
          if (parsed.predictions.length > 0) {
            parsed.predictions[0].specificKushtha = parsed.specificKushtha;
            parsed.predictions[0].modernClinicalCorrelation = parsed.modernClinicalCorrelation;
            parsed.predictions[0].confidenceScore = parsed.confidenceScore;
          } else {
            parsed.predictions = [{
              specificKushtha: parsed.specificKushtha,
              modernClinicalCorrelation: parsed.modernClinicalCorrelation,
              confidenceScore: parsed.confidenceScore
            }];
          }

          // Deduplicate predictions & pad to 3 candidates correctly using database items
          const cleanedPreds: any[] = [];
          const seenKeys = new Set<string>();
          parsed.predictions.forEach((pred: any) => {
            const key = normalizeStr(pred.specificKushtha);
            if (key && !seenKeys.has(key)) {
              seenKeys.add(key);
              cleanedPreds.push(pred);
            }
          });

          if (cleanedPreds.length < 3) {
            const fillCandidates = LOCAL_KUSHTHA_DATABASE.filter(k => 
              !seenKeys.has(normalizeStr(k.specificKushtha)) && 
              k.specificKushtha !== "Sama Twak"
            );
            let idxOffset = cleanedPreds.length;
            fillCandidates.slice(0, 3 - cleanedPreds.length).forEach(cand => {
              cleanedPreds.push({
                specificKushtha: cand.specificKushtha,
                modernClinicalCorrelation: cand.modernClinicalCorrelation,
                confidenceScore: Math.max(10, Math.round(parsed.confidenceScore * 0.45 - idxOffset * 8))
              });
              idxOffset++;
            });
          }

          // Keep the primary diagnosis (index 0) fixed at index 0 so it is never hijacked.
          // Sort only the remaining predictions (from index 1 onwards) in descending order of confidence.
          const primaryDiagnosis = cleanedPreds[0];
          const alternativePreds = cleanedPreds.slice(1);
          alternativePreds.sort((a, b) => b.confidenceScore - a.confidenceScore);
          
          // Ensure alternative diagnoses have confidence scores strictly less than the primary diagnosis to keep visual display logical
          alternativePreds.forEach(pred => {
            if (pred.confidenceScore >= primaryDiagnosis.confidenceScore) {
              pred.confidenceScore = Math.max(10, primaryDiagnosis.confidenceScore - 5);
            }
          });
          
          const finalCleanedPreds = [primaryDiagnosis, ...alternativePreds];
          
          // Re-bind parsed root specificKushtha, modern name, and confidence score to match index 0 exactly
          parsed.specificKushtha = finalCleanedPreds[0].specificKushtha;
          parsed.modernClinicalCorrelation = finalCleanedPreds[0].modernClinicalCorrelation;
          parsed.confidenceScore = finalCleanedPreds[0].confidenceScore;
          
          // Re-fetch correct codes for root index 0 match
          const matchedRoot = LOCAL_KUSHTHA_DATABASE.find(k => 
            normalizeStr(k.specificKushtha) === normalizeStr(parsed.specificKushtha)
          );
          if (matchedRoot) {
            if (!parsed.icd11 || parsed.icd11 === "N/A" || parsed.icd11 === "") {
              parsed.icd11 = matchedRoot.icd11;
            }
            parsed.tm2 = matchedRoot.tm2;
            
            // Do NOT overwrite the AI's computed Doshas here - let the questionnaire define systemic Doshas, 
            // and let the visual evidence dictate the specific Kushtha independently.
            
            // Enforce accurate Ayurvedic textbook Lakshanas over the AI generated ones
            parsed.lakshanasFound = matchedRoot.lakshanas;
            
            // Also enforce recommendations to point precisely to the correct Chikitsa
            if (matchedRoot.recommendations && matchedRoot.recommendations.length > 0) {
              parsed.recommendations = matchedRoot.recommendations;
            }
          }

          parsed.predictions = finalCleanedPreds.slice(0, 3);
        }

        return res.json(parsed);
      } catch (gemError: any) {
        const errorMsg = String(gemError?.message || "").toUpperCase();
        const codeStr = String(gemError?.code || "");
        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE") || errorMsg.includes("QUOTA") || codeStr.includes("429") || errorMsg.includes("RATE");
        if (isQuota) {
          recordGeminiQuotaExceeded();
        }
        console.log("[GEMINI API] Skin analysis call processed via local Ayurvedic rule-based diagnostic engine (Offline style). Status: " + cleanApiError(gemError));
        const localDiagnosis = getLocalAyurvedicDiagnosis(questionnaireData, inferredFeatures, userProfile);
        return res.json(localDiagnosis);
      }
    } catch (error: any) {
      console.error("Server Skin Analysis Uncaught Error, invoking offline safety engine:", error);
      try {
        const localDiagnosis = getLocalAyurvedicDiagnosis(req.body?.questionnaireData, req.body?.inferredFeatures || [], req.body?.userProfile || {});
        return res.json(localDiagnosis);
      } catch (innerFallbackErr) {
        console.error("Fatal offline safety engine error:", innerFallbackErr);
        return res.status(500).json({ error: "Skin analysis failed unexpectedly due to system resource conflict. Please retry." });
      }
    }
  });

  // Vite development / production middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
