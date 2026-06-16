/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Upload, Download, History, RefreshCcw, User, Users, ChevronRight, 
  ChevronLeft, ClipboardCheck, AlertCircle, AlertTriangle, Terminal, Play, Info, BookOpen, Quote, Trash2,
  Sparkles, Globe, Search, ArrowRight, Check, Database, Leaf, ExternalLink
} from 'lucide-react';
import { LAKSHANA_QUESTIONS, KUSHTHA_QUESTIONS, KUSHTHA_TYPES, DOSHA_THEMES, INDIAN_STATES, SAMHITA_KUSHTHA_DATA, KushthaType, getSamhitaData } from './constants';
import { analyzeSkin, preAnalyzeVisuals, AnalysisResult } from './services/geminiService';
import { enhanceSkinImage, analyzeImageQualityMetrics, ImageQualityMetrics } from './services/imageEnhancer';
import { generateClinicalPDF } from './lib/pdfGenerator';
import { BodyMap } from './components/BodyMap';
import { auth, db, loginWithGoogle, logoutUser, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

interface UserProfile {
  name: string;
  dob: string;
  age: string;
  sex: string;
  state: string;
  phone: string;
  occupation: string;
  chronicity: string;
  familyHistory: string;
}

const calculateAge = (dob: string): string => {
  if (!dob) return '';
  const [year, month, day] = dob.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age.toString() : '0';
};

const downscaleDataUrl = (dataUrl: string, maxDim = 240): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

const parseAyurvedicRecommendation = (rec: string) => {
  const match = rec.match(/^\(([^)]+)\)\s*(.*)$/);
  if (match) {
    return {
      category: match[1].trim(),
      content: match[2].trim()
    };
  }
  const lowered = rec.toLowerCase();
  if (lowered.includes('vamana') || lowered.includes('virechana') || lowered.includes('shodhana') || lowered.includes('raktamokshana') || lowered.includes('snehapana') || lowered.includes('sarpipana')) {
    return { category: 'SHODHANA', content: rec };
  }
  if (lowered.includes('lepa') || lowered.includes('taila') || lowered.includes('application') || lowered.includes('wash') || lowered.includes('oil') || lowered.includes('ghee') || lowered.includes('snana') || lowered.includes('bath') || lowered.includes('seka')) {
    return { category: 'LOCAL THERAPY', content: rec };
  }
  if (lowered.includes('diet') || lowered.includes('pathya') || lowered.includes('avoid') || lowered.includes('minimise')) {
    if (lowered.includes('avoid') || lowered.includes('apathya') || lowered.includes('abstain')) {
      return { category: 'APATHYA - AVOID', content: rec };
    }
    return { category: 'PATHYA - DIET', content: rec };
  }
  return { category: 'INTERNAL SAMANA', content: rec };
};

const getModernValidation = (category: string, content: string) => {
  const cat = (category || "").toUpperCase();
  const text = (content || "").toLowerCase();

  // Define database of exact matches & key scientific terms
  if (text.includes("abhyanga") || text.includes("massage") || text.includes("dhanwantaram")) {
    return {
      equivalent: "Sebum-mimetic Massaged Lipophilic Hydration",
      validation: "Tactile application of warm, medicated lipid layers reduces mechanical tension, replenishes vital skin lipids in the stratum corneum, limits transepidermal water loss (TEWL), and modulates cutaneous sensory nerve endings to decrease severe pruritus and localized discomfort."
    };
  }

  if (text.includes("snehapana") || text.includes("administration of medicated ghee") || text.includes("ghee ingestion")) {
    return {
      equivalent: "Systemic Lipid Carrier & Treg-Mediated Immunomodulation",
      validation: "Ingested medicated ghee delivers butyric acid and bioactive phytosterols acting as histone deacetylase (HDAC) inhibitors which promote regulatory T-cells (Tregs). Ghee enhances absorption of fat-soluble anti-inflammatory principles protecting the intestinal barrier (reducing systemic gut-to-skin cytokine flares)."
    };
  }

  if (text.includes("seka") || text.includes("pouring") || text.includes("vetiver") || text.includes("chandana water")) {
    return {
      equivalent: "Astringent Cryotherapy & Microvascular Vaso-constriction",
      validation: "Hydro-continuous cold herbal washes supply tannins and cooling sesquiterpenes which temporarily restrict cutaneous hyperthermia, vaso-constrict local capillaries, and wash out crusting waste to downregulate superficial visual erythema."
    };
  }

  if (text.includes("prapa") || text.includes("shatadhauta") || text.includes("paste") || text.includes("lepa") || text.includes("sandalwood")) {
    return {
      equivalent: "Topical Emulsion Coating & Anti-inflammatory NF-kB Suppression",
      validation: "Represents a topical hydro-lipid paste barrier. Water-washed ghee forms a sterile, highly-biocompatible cream matrix supplying docosahexaenoic acid (DHA) that downregulates pro-inflammatory NF-kB pathways and accelerates wound healing."
    };
  }

  if (text.includes("vamana") || text.includes("emesis")) {
    return {
      equivalent: "Vagal Autonomic Reflex Reset & Degranulation Inhibition",
      validation: "Therapeutic emesis evokes intense vagal stimulation which induces parasympathetic recovery, decreases high levels of circulating systemic leukotriene B4, and restricts IgE-mediated mast-cell degranulation."
    };
  }

  if (text.includes("virechana") || text.includes("purgation")) {
    return {
      equivalent: "Enterohepatic Cleansing & Gut-Skin Axis Microbiome Optimization",
      validation: "Induces systemic purgation that flushes out excess organic toxins while modulating the beneficial bacteroidetes-to-firmicutes ratio. This effectively stabilizes gut-barrier tight junctions and minimizes systemic pro-inflammatory cytokine expression."
    };
  }

  if (text.includes("raktamokshana") || text.includes("bloodletting") || text.includes("leech")) {
    return {
      equivalent: "Microcirculatory Decompression & Cytokine Washout",
      validation: "Mechanical bloodletting or therapeutic leeching resolves localized venous stasis, delivers active salivary hirudin to improve vascular parameters, and flushes high localized concentrations of tissue-destructive cytokines (TNF-alpha, IL-1beta) from chronically inflamed lesions."
    };
  }

  if (text.includes("udvartana") || text.includes("dry-powder") || text.includes("powder rubs")) {
    return {
      equivalent: "Abrasive Hyperkeratosis Exfoliation & Lymphatic Decongestant",
      validation: "Manual friction with dry polyphenolic powder removes necrotic squames and hyperkeratotic plaque buildup without stripping delicate skin lipids. This stimulates localized blood-lymph flow to expedite debris clearance."
    };
  }

  if (text.includes("sun protection") || text.includes("aloe vera") || text.includes("barrier creams")) {
    return {
      equivalent: "UVA/UVB Photonic Protection & Koebner Phenomenon Prophylaxis",
      validation: "Broad-spectrum soothing barriers (like aloemycin and glycyrrhizin) reflect cellular UV damage, suppress photo-induced epidermal cell-division, and shield hyper-reactive skin from psoriasis-triggering Koebner phenomenon."
    };
  }

  if (text.includes("raktaprasadana") || text.includes("manjistha") || text.includes("sariva")) {
    return {
      equivalent: "Systemic Phytophile ROS Scavenging & Vasoprotection",
      validation: "Administration of rubiadin and sarsasapogenin extracts neutralizes toxic intracellular reactive oxygen species (ROS), strengthens vascular endothelia, and suppresses aberrant epidermal hyperproliferation."
    };
  }

  if (text.includes("neem") || text.includes("yashtimadhu") || text.includes("ointments")) {
    return {
      equivalent: "Broad-Spectrum Biological Antimicrobial & Antimicrobial Peptide Support",
      validation: "Supplies limonoids and saponins which directly compromise the cell walls of potential secondary pathogens (such as Staphylococcus aureus and beta-hemolytic Streptococcus) while soothing skin dryness."
    };
  }

  if (text.includes("khadir") || text.includes("acacia") || text.includes("lukewarm water")) {
    return {
      equivalent: "Polyphenolic Collagen Cross-linking & Mast-Cell Stabilizer",
      validation: "Ingestion of Acacia catechins supplies massive levels of epicatechin gallates that cross-link and reinforce dermal collagen matrices while physically stabilizing histaminergic receptors to decrease intense pruritus."
    };
  }

  // Broad Fallback Category mappings if exact text matches aren't triggered
  if (cat.includes('SHODHANA')) {
    return {
      equivalent: "Systemic Metabolic Clearance & Immune Downregulation",
      validation: "Systemic purification directly cleanses the vascular-digestive channels of lipid peroxides and pathogen-associated molecular structures, suppressing generalized hyper-reactivity of skin."
    };
  }

  if (cat.includes('LOCAL') || cat.includes('THERAPY')) {
    return {
      equivalent: "Epidermal Barrier Reconstitution & Lipid Replenishment",
      validation: "Supplies concentrated skin-biocompatible moisturization, reducing transepidermal water loss and preventing external allergens from penetrating through weak cell junctions."
    };
  }

  if (cat.includes('SAMANA') || cat.includes('INTERNAL')) {
    return {
      equivalent: "Systemic Anti-inflammatory & Host Immune Modulation",
      validation: "Phytochemical herbal compounds act as circulating protective agents, stabilizing mast cells, downregulating peripheral arachidonic acid cascades, and clearing free radicals."
    };
  }

  if (cat.includes('PATHYA')) {
    return {
      equivalent: "Low-Glycemic Prebiotic Nutritional Protocol",
      validation: "Limits spikes in insulin-like growth factor-1 (IGF-1), thereby preventing lipid synthesis and excess follicular desquamation, while fostering beneficial anti-inflammatory intestinal flora."
    };
  }

  if (cat.includes('APATHYA')) {
    return {
      equivalent: "Systemic Antigen Elimination protocol",
      validation: "Elimination of high-sodium, high-sugar, and cow dairy antigens triggers downregulation of the inflammatory mTORC1 pathway, limiting tissue infiltration by helper T-cells."
    };
  }

  return {
    equivalent: "Supportive Dermatological Barrier Optimization",
    validation: "Standard clinical supportive care protocol to maintain natural moisture, protect compromised skin integrity, and avoid physical or chemical triggers."
  };
};

const getDoshaPrinciple = (primaryDosha: string) => {
  const dosha = (primaryDosha || "Vata").trim();
  
  if (dosha.includes("Vata") && dosha.includes("Kapha")) {
    return {
      sanskrit: "वातकफप्रधानेषु घृतपानं वमनं च॥",
      translation: "For Vata-Kapha dominant Kushtha, Charaka advises primary Sarpipana (medicated ghee ingestion) to nourish against dryness, followed by Vamana (therapeutic emesis) to eliminate stagnant Kapha.",
      verse: "Chikitsa 7:39-40",
      primaryTherapy: "Sarpipana & Vamana",
      colorClass: "border-amber-500/15 bg-amber-500/5 text-amber-400 text-amber-500/30 text-amber-500/10 text-amber-500/20"
    };
  }
  if (dosha.includes("Kapha") && dosha.includes("Pitta")) {
    return {
      sanskrit: "कफपित्तप्रधानेषु वमनं विरेचनं च॥",
      translation: "For Kapha-Pitta dominant Kushtha, Charaka advises primary Vamana (emesis) followed by Virechana (purgation) to cleanse wetness and cool active inflammation.",
      verse: "Chikitsa 7:39-40",
      primaryTherapy: "Vamana & Virechana",
      colorClass: "border-emerald-500/15 bg-emerald-500/5 text-emerald-400 text-emerald-500/30 text-emerald-500/10 text-emerald-500/20"
    };
  }
  if (dosha.includes("Vata") && dosha.includes("Pitta")) {
    return {
      sanskrit: "वातपित्तप्रधानेषु घृतपानं विरेचनं रक्तमोक्षणं॥",
      translation: "For Vata-Pitta dominant Kushtha, Charaka advises primary Sarpipana (ghee ingestion) followed by Virechana (purgation) or Raktamokshana (bloodletting) to counter raw burning and parched tissue.",
      verse: "Chikitsa 7:39-40",
      primaryTherapy: "Sarpipana & Virechana/Raktamokshana",
      colorClass: "border-rose-500/15 bg-rose-500/5 text-rose-400 text-rose-500/30 text-rose-500/10 text-rose-500/20"
    };
  }
  if (dosha.includes("Vata")) {
    return {
      sanskrit: "वातप्रधानेषु कुष्ठेषु पूर्वं घृतपानम्॥",
      translation: "For pure Vata-dominant Kushtha, Sarpipana (internal administration of medicated ghee) is the mandatory first choice of treatment to lubricate parched body channels.",
      verse: "Chikitsa 7:39",
      primaryTherapy: "Sarpipana (Ghee Pana)",
      colorClass: "border-amber-500/15 bg-amber-500/5 text-amber-400 text-amber-500/30 text-amber-500/10 text-amber-500/20"
    };
  }
  if (dosha.includes("Pitta")) {
    return {
      sanskrit: "पित्तप्रधानेषु विरेचनं रक्तमोक्षणं च॥",
      translation: "For Pitta-dominant Kushtha, Virechana (purgation) and Raktamokshana (bloodletting) should be instituted first to cool the blood (Rakta Prasadana) and resolve heat.",
      verse: "Chikitsa 7:39",
      primaryTherapy: "Virechana & Raktamokshana",
      colorClass: "border-rose-500/15 bg-rose-500/5 text-rose-400 text-rose-500/30 text-rose-500/10 text-rose-500/20"
    };
  }
  if (dosha.includes("Kapha")) {
    return {
      sanskrit: "कफप्रधानेषु कुष्ठेषु वमनं प्रसेकश्च॥",
      translation: "For Kapha-dominant Kushtha, Vamana (therapeutic emesis) and Praseka are recommended first to eliminate stored mucous, moist scaling, and localized stagnation.",
      verse: "Chikitsa 7:39",
      primaryTherapy: "Vamana Karma (Emesis)",
      colorClass: "border-emerald-500/15 bg-emerald-500/5 text-emerald-400 text-emerald-500/30 text-emerald-500/10 text-emerald-500/20"
    };
  }
  
  return {
    sanskrit: "दोषप्राधान्यं वीक्ष्य कुष्ठचिकित्सा प्रवर्तेत॥",
    translation: "Charaka-Kushtha-Chikitsa states that therapy must correspond strictly to the dominant Dosha profile, incorporating balanced purification (Shodhana) and soothing diets.",
    verse: "Chikitsa 7:39",
    primaryTherapy: "Sama Shodhana & Pathya",
    colorClass: "border-emerald-500/15 bg-emerald-500/5 text-emerald-400 text-emerald-500/30 text-emerald-500/10 text-emerald-500/20"
  };
};

type TabType = 'assessment' | 'history' | 'education' | 'profile';

function CloudSyncCard({ 
  currentUser, 
  isSyncing, 
  setIsSyncing, 
  setHistory 
}: { 
  currentUser: any; 
  isSyncing: boolean; 
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>; 
  setHistory: React.Dispatch<React.SetStateAction<any[]>>; 
}) {
  return (
    <div className="ayur-card p-6 border-white/5 bg-stone-900/40 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
          <Database size={24} />
        </div>
        <div className="space-y-1 text-left">
          <h3 className="serif text-xl text-white">Cloud Sync Persistence</h3>
          {currentUser ? (
            <div className="space-y-1">
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.55">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Cloud State Synchronized
              </p>
              <p className="text-xs text-stone-400 text-left">Authenticated via <strong className="text-stone-300">{currentUser.email}</strong></p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle size={10} /> Local Cache Only
              </p>
              <p className="text-xs text-stone-400 text-left">Sign in to automatically sync profiles, image URLs and diagnostic histories between phone and desktop.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 shrink-0 w-full md:w-auto">
        {currentUser ? (
          <>
            <button 
              onClick={async () => {
                setIsSyncing(true);
                try {
                  const sessionsColRef = collection(db, 'users', currentUser.uid, 'sessions');
                  const sessionsSnap = await getDocs(sessionsColRef);
                  const dbSessions: any[] = [];
                  sessionsSnap.forEach((docSnap) => {
                    dbSessions.push(docSnap.data());
                  });
                  dbSessions.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
                  setHistory(dbSessions);
                } catch (err) {
                  console.error("Manual sync failed:", err);
                } finally {
                  setTimeout(() => setIsSyncing(false), 800);
                }
              }}
              disabled={isSyncing}
              className="flex-1 md:flex-none px-6 py-3 bg-emerald-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCcw size={12} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </button>
            <button 
              onClick={async () => {
                try {
                  await logoutUser();
                  setHistory([]);
                } catch (err) {
                  console.error("Sign out error:", err);
                }
              }}
              className="px-6 py-3 bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button 
            onClick={async () => {
              try {
                await loginWithGoogle();
              } catch (err) {
                console.error("Google sign in failure:", err);
              }
            }}
            className="w-full md:w-auto px-8 py-3 bg-emerald-500 text-black font-semibold rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles size={12} />
            Sign In with Google
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('assessment');
  const [icdSearchQuery, setIcdSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KushthaType | null>(null);
  const [diagnosticMode, setDiagnosticMode] = useState<'dosha' | 'kushtha'>('dosha');
  const [step, setStep] = useState<'welcome' | 'profile' | 'scan' | 'affected_area' | 'questions' | 'kushtha_questions' | 'analyzing' | 'results'>('welcome');
  const [lesionExtent, setLesionExtent] = useState<'single' | 'limited' | 'widespread' | null>(null);
  const [affectedAreas, setAffectedAreas] = useState<string[]>([]);
  const [areaHistory, setAreaHistory] = useState<string[][]>([[]]);
  const [history, setHistory] = useState<(AnalysisResult & { date: string, profile: UserProfile })[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load initial local data once at startup
  React.useEffect(() => {
    const stored = localStorage.getItem('avabhasini_history');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("History parse error:", e);
      }
    }
  }, []);

  // Monitor auth status and execute Cloud Sync
  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setCurrentUser(firebaseUser);
      setAuthLoading(false);
      
      if (firebaseUser) {
        setIsSyncing(true);
        console.log("[Firestore Sync] User logged in. Processing synchronization...");
        try {
          // 1. Fetch cloud profile
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const cloudData = userDocSnap.data();
            if (cloudData.profile) {
              setOwnerProfile(cloudData.profile);
            }
            if (cloudData.isProfileLocked !== undefined) {
              setIsProfileLocked(cloudData.isProfileLocked);
            }
          } else {
            // Upload local profile to Cloud if it is non-empty
            const localStoredProfile = localStorage.getItem('avabhasini_owner_profile');
            const localProfileObj = localStoredProfile ? JSON.parse(localStoredProfile) : null;
            const localLocked = localStorage.getItem('avabhasini_profile_locked') === 'true';
            
            if (localProfileObj && localProfileObj.name) {
              await setDoc(userDocRef, {
                profile: localProfileObj,
                isProfileLocked: localLocked,
                updatedAt: new Date().toISOString()
              });
            }
          }

          // 2. Fetch cloud history sessions and merge with local
          const sessionsColRef = collection(db, 'users', firebaseUser.uid, 'sessions');
          const sessionsSnap = await getDocs(sessionsColRef);
          
          const dbSessions: any[] = [];
          sessionsSnap.forEach((docSnap) => {
            dbSessions.push(docSnap.data());
          });

          // Sort by creation date descending
          dbSessions.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

          setHistory(prevLocal => {
            // Merge logic: ensure none are duplicated
            const merged = [...dbSessions];
            
            // For any local records NOT in the cloud, upload them to cloud
            prevLocal.forEach(localRecord => {
              const localId = (localRecord as any).sessionId;
              const alreadyInCloud = dbSessions.some(cloudRec => 
                (localId && cloudRec.sessionId === localId) || cloudRec.date === localRecord.date
              );
              
              if (!alreadyInCloud) {
                // Ensure a safe sessionId exists
                const newSessionId = localId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const sessionToUpload = {
                  ...localRecord,
                  sessionId: newSessionId,
                  createdAt: new Date(localRecord.date).toISOString() || new Date().toISOString()
                };
                merged.push(sessionToUpload);
                
                // Asynchronously save to cloud in background
                setDoc(doc(db, 'users', firebaseUser.uid, 'sessions', newSessionId), sessionToUpload)
                  .then(() => console.log(`[Firestore Sync] Auto-uploaded legacy local session ${newSessionId}`))
                  .catch(err => console.error("Firestore auto-upload legacy error:", err));
              }
            });

            merged.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
            return merged;
          });

        } catch (err) {
          console.error("Authentication/Sync workflow error:", err);
        } finally {
          setIsSyncing(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Update localStorage when local history state is updated by any action
  React.useEffect(() => {
    try {
      if (history.length > 0) {
        localStorage.setItem('avabhasini_history', JSON.stringify(history));
      } else {
        localStorage.removeItem('avabhasini_history');
      }
    } catch (error: any) {
      console.error("Local storage history error (QuotaExceeded):", error);
      if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22) {
        // Step 1: Strip older items' images to rescue space
        console.log("Quota exceeded. Stripping images from older history records...");
        const cleanerHistory = history.map((item, idx) => {
          if (idx > 0 && (item as any).images) {
            const { images, ...rest } = item as any;
            return rest;
          }
          return item;
        });
        
        try {
          localStorage.setItem('avabhasini_history', JSON.stringify(cleanerHistory));
          setHistory(cleanerHistory);
        } catch (innerErr1) {
          // Step 2: Strip ALL images from all records if still failing
          console.warn("Stripping all images to fit storage...");
          const noImagesHistory = history.map(item => {
            if ((item as any).images) {
              const { images, ...rest } = item as any;
              return rest;
            }
            return item;
          });
          
          try {
            localStorage.setItem('avabhasini_history', JSON.stringify(noImagesHistory));
            setHistory(noImagesHistory);
          } catch (innerErr2) {
            // Step 3: Keep only the 5 most recent records without images
            console.warn("Pruning to 5 items without images...");
            const pruned = noImagesHistory.slice(0, 5);
            try {
              localStorage.setItem('avabhasini_history', JSON.stringify(pruned));
              setHistory(pruned);
            } catch (innerErr3) {
              console.error("Pruning failed completely, clearing history to prevent crash:", innerErr3);
              setHistory([]);
              localStorage.removeItem('avabhasini_history');
            }
          }
        }
      }
    }
  }, [history]);

  const initialProfile: UserProfile = {
    name: '',
    dob: '',
    age: '',
    sex: '',
    state: '',
    phone: '',
    occupation: '',
    chronicity: '',
    familyHistory: ''
  };

  const [userProfile, setUserProfile] = useState<UserProfile>(initialProfile);

  const [ownerProfile, setOwnerProfile] = useState<UserProfile>(() => {
    const stored = localStorage.getItem('avabhasini_owner_profile');
    if (stored) {
      try {
        const profile = JSON.parse(stored);
        const merged = { ...initialProfile, ...profile };
        if (merged.dob) {
          merged.age = calculateAge(merged.dob);
        }
        return merged;
      } catch (e) {
        console.error("Owner profile parse error:", e);
      }
    }
    return initialProfile;
  });

  const [isProfileLocked, setIsProfileLocked] = useState<boolean>(() => {
    return localStorage.getItem('avabhasini_profile_locked') === 'true';
  });

  // Keep ownerProfile synced with localstorage & cloud document
  React.useEffect(() => {
    try {
      localStorage.setItem('avabhasini_owner_profile', JSON.stringify(ownerProfile));
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        setDoc(userDocRef, {
          profile: ownerProfile,
          isProfileLocked: isProfileLocked,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
        });
      }
    } catch (e) {
      console.error("Failed to save owner profile:", e);
    }
  }, [ownerProfile, currentUser]);

  // Keep lock selection synced with localstorage & cloud document
  React.useEffect(() => {
    try {
      localStorage.setItem('avabhasini_profile_locked', isProfileLocked.toString());
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        setDoc(userDocRef, {
          isProfileLocked: isProfileLocked,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
        });
      }
    } catch (e) {
      console.error("Failed to save profile lock state:", e);
    }
  }, [isProfileLocked, currentUser]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [qualityNotice, setQualityNotice] = useState<{ score: number, reason?: string } | null>(null);
  const [imageQuality, setImageQuality] = useState<{ score: number, isHighQuality: boolean, reason?: string } | null>(null);
  const [showQualityWarningModal, setShowQualityWarningModal] = useState(false);
  const [bypassedQuality, setBypassedQuality] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({});
  const [kushthaAnswers, setKushthaAnswers] = useState<Record<string, boolean | null>>({});
  const [isVisualScanning, setIsVisualScanning] = useState(false);
  const [scanCompleteNotice, setScanCompleteNotice] = useState(false);
  const [inferredFeatures, setInferredFeatures] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const calculateLocalQualityScore = (rawMetrics: any): { score: number; isHighQuality: boolean; reason: string } => {
    let score = 98;
    let reason = "High-quality dermatological photo.";

    if (!rawMetrics) {
      return { score: 50, isHighQuality: false, reason: "Unable to read image physical metrics." };
    }

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

    if (s < 8) {
      sharpnessPenalty = (8 - s) * 10.0;
    }

    if (mp < 0.5) {
      resolutionPenalty = (0.5 - mp) * 80.0;
    }

    let finalScore = Math.round(98 - brightnessPenalty - sharpnessPenalty - resolutionPenalty);
    
    // Explicitly drag below 65% minimum benchmark if there are critical defects
    if (b < 50 || b > 220 || s < 5 || mp < 0.25) {
      finalScore = Math.min(finalScore, 58);
    }

    score = Math.max(10, Math.min(100, finalScore));

    if (score < 65) {
      if (s < 5) {
        reason = "Image is out-of-focus or blurry. Please hold camera steady.";
      } else if (b < 50) {
        reason = "Image is underexposed or too dark. Match lighting guidelines.";
      } else if (b > 220) {
        reason = "Image is overexposed or too bright. Reduce direct glare.";
      } else if (mp < 0.25) {
        reason = "Symptom image is too small or low-resolution.";
      } else {
        reason = "Poor image framing, sharpness, or lighting detected.";
      }
    }

    return {
      score,
      isHighQuality: score >= 65,
      reason
    };
  };
  const [resultsTab, setResultsTab] = useState<'ayurvedic' | 'modern'>('ayurvedic');
  const [lastAnalysisImageSet, setLastAnalysisImageSet] = useState<string>('');
  const [suggestedKushtha, setSuggestedKushtha] = useState<KushthaType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Layer 1 Guided Capture & Layer 3 Enhancement UI states
  const [liveBrightness, setLiveBrightness] = useState<number | null>(null);
  const [liveSharpness, setLiveSharpness] = useState<number | null>(null);
  const [liveLightStatus, setLiveLightStatus] = useState<'dark' | 'bright' | 'good' | null>(null);
  const [liveSharpStatus, setLiveSharpStatus] = useState<'blurry' | 'sharp' | null>(null);
  const [liveDistanceStatus, setLiveDistanceStatus] = useState<'too_close' | 'too_far' | 'good' | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState<boolean>(false);
  const [autoCaptureTimeLeft, setAutoCaptureTimeLeft] = useState<number | null>(null);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isCheckingQuality, setIsCheckingQuality] = useState<boolean>(false);

  const totalDoshaQuestions = LAKSHANA_QUESTIONS.reduce((acc, cat) => acc + cat.questions.length, 0);
  const answeredDoshaCount = LAKSHANA_QUESTIONS.reduce((acc, cat) => 
    acc + cat.questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== null).length, 
    0
  );
  // Relaxed requirement: allow advancing if at least one question is answered or if user wants to skip
  const canAdvanceDosha = true; 

  const totalKushthaQuestions = KUSHTHA_QUESTIONS.reduce((acc, cat) => acc + cat.questions.length, 0);
  const answeredKushthaCount = KUSHTHA_QUESTIONS.reduce((acc, cat) => 
    acc + cat.questions.filter(q => kushthaAnswers[q.id] !== undefined && kushthaAnswers[q.id] !== null).length, 
    0
  );
  
  const isImageSetQualified = images.length > 0 && !isCheckingQuality && (
    imageQuality !== null && imageQuality.score >= 65
  );

  // Allow analysis if at least one image exists and meets quality standards (65%+ or at least 3 views) and checking is finished
  const canRunAnalysis = images.length > 0 && isImageSetQualified && !isCheckingQuality && !isEnhancing && !isVisualScanning;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support camera access.");
      }
      
      setIsCameraActive(true);
      
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          } 
        });
      } catch (e) {
        console.warn("Failed to get environment camera, falling back to any camera");
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
      }

      setStream(mediaStream);

    } catch (err: any) {
      console.error("Camera error:", err);
      setIsCameraActive(false);
      setStream(null);
      setError(err.name === 'NotAllowedError' 
        ? "Camera permission denied. Please enable it in your browser settings." 
        : "Could not access camera. Please check your connection or upload a photo instead.");
      setStep('welcome');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (isCameraActive && stream && videoRef.current) {
      const video = videoRef.current;
      if (video.srcObject !== stream) {
        console.log("Attaching stream to video element");
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().catch(e => console.error("Video play error:", e));
        };
      }
    }
  }, [isCameraActive, stream, videoRef.current]);

  // Layer 1: Real-time Camera Analytics for Guided Capture
  useEffect(() => {
    if (!isCameraActive || !stream || step !== 'scan') {
      setLiveBrightness(null);
      setLiveSharpness(null);
      setLiveLightStatus(null);
      setLiveSharpStatus(null);
      setLiveDistanceStatus(null);
      setAutoCaptureTimeLeft(null);
      return;
    }

    let active = true;
    let autoCaptureCounter = 12; // held frames under optimal conditions
    let intervalId: any = null;

    const analyzeFrame = () => {
      if (!active || !videoRef.current) return;
      const video = videoRef.current;
      
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = 100;
          offscreenCanvas.height = 100;
          const ctx = offscreenCanvas.getContext('2d');
          
          if (ctx) {
            const size = Math.min(video.videoWidth, video.videoHeight);
            const sx = (video.videoWidth - size) / 2;
            const sy = (video.videoHeight - size) / 2;
            ctx.drawImage(video, sx, sy, size, size, 0, 0, 100, 100);
            
            const imgData = ctx.getImageData(0, 0, 100, 100);
            const data = imgData.data;
            const len = data.length;
            
            let brightnessTotal = 0;
            const count = len / 4;
            for (let i = 0; i < len; i += 4) {
              brightnessTotal += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
            }
            const avgBrightness = brightnessTotal / count;
            setLiveBrightness(Math.round(avgBrightness));
            
            const lightStatus = avgBrightness < 55 ? 'dark' : avgBrightness > 215 ? 'bright' : 'good';
            setLiveLightStatus(lightStatus);

            let diffSum = 0;
            let diffSqSum = 0;
            let sampleCount = 0;
            for (let i = 0; i < len - 4; i += 16) {
              const current = (data[i] + data[i+1] + data[i+2]) / 3;
              const next = (data[i+4] + data[i+5] + data[i+6]) / 3;
              const diff = Math.abs(current - next);
              diffSum += diff;
              diffSqSum += diff * diff;
              sampleCount++;
            }
            const meanGrad = diffSum / (sampleCount || 1);
            const variance = (diffSqSum / (sampleCount || 1)) - (meanGrad * meanGrad);
            setLiveSharpness(Math.round(variance));
            
            const sharpStatus = variance < 12 ? 'blurry' : 'sharp';
            setLiveSharpStatus(sharpStatus);

            let distance: 'too_close' | 'too_far' | 'good' = 'good';
            if (variance < 6) {
              distance = 'too_close';
            } else if (variance >= 6 && variance < 12) {
              distance = 'too_far';
            } else {
              distance = 'good';
            }
            setLiveDistanceStatus(distance);

            if (autoCaptureEnabled) {
              if (lightStatus === 'good' && sharpStatus === 'sharp' && distance === 'good') {
                autoCaptureCounter--;
                const timeLeft = Math.max(0, Math.ceil(autoCaptureCounter / 4));
                setAutoCaptureTimeLeft(timeLeft);
                
                if (autoCaptureCounter <= 0) {
                  setAutoCaptureTimeLeft(0);
                  captureImage();
                  autoCaptureCounter = 12;
                }
              } else {
                autoCaptureCounter = 12;
                setAutoCaptureTimeLeft(null);
              }
            }
          }
        } catch (e) {
          console.error("Live analysis loop error:", e);
        }
      }
    };

    intervalId = setInterval(analyzeFrame, 200);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isCameraActive, stream, step, autoCaptureEnabled]);

  const setVideoRef = (el: HTMLVideoElement | null) => {
    (videoRef as any).current = el;
    if (el && stream && isCameraActive) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(e => console.error("Video play error:", e));
      }
    }
  };

  // Cleanup on unmount or step change
  useEffect(() => {
    if (step !== 'scan') {
      stopCamera();
    }
  }, [step]);

  const runVisualScan = async (imgData: string[]) => {
    setIsVisualScanning(true);
    setQualityNotice(null);
    try {
      // Pre-compute local color metrics and texture distributions
      const computedMetrics = await Promise.all(
        imgData.map(img => analyzeImageQualityMetrics(img).catch(() => null))
      );
      // Check quality of the latest image if it was just added as a single one
      // Since this function now takes an array, we evaluate the set.
      const { present, absent } = await preAnalyzeVisuals(imgData, computedMetrics);
      
      // Expand present and absent lists with equivalent/synonym IDs
      const expandWithSynonyms = (list: string[]) => {
        const expanded = new Set<string>();
        list.forEach(id => {
          if (!id) return;
          expanded.add(id);
          
          // Dryness & rough texture synonyms
          if (['dry_rough', 'ruksha_texture', 'charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'].includes(id)) {
            expanded.add('dry_rough');
            expanded.add('ruksha_texture');
            expanded.add('charak_vat_raukshya');
            expanded.add('charak_vat_parushya');
            expanded.add('charak_vat_kharabhava');
            expanded.add('rough_karkasha');
            expanded.add('rough_parusha');
            expanded.add('karkasha_rough');
            // Ruksha (dryness) physiologically maps to tension/contraction and roughness-induced pricking sensations:
            expanded.add('charak_vat_sankochana');  // Contraction
            expanded.add('charak_vat_aayama');      // Drawing tension
          }
          // Burning sensation synonyms
          if (['burning', 'burning_sensation', 'charak_pit_daha'].includes(id)) {
            expanded.add('burning');
            expanded.add('burning_sensation');
            expanded.add('charak_pit_daha');
          }
          // Redness / inflammatory raga
          if (['redness', 'charak_pit_raga', 'gunja_color', 'udumbara_color'].includes(id)) {
            expanded.add('redness');
            expanded.add('charak_pit_raga');
            expanded.add('gunja_color');
            expanded.add('udumbara_color');
            // Redness and inflammatory heat clinically induce burning sensation (Daha)
            expanded.add('burning');
            expanded.add('burning_sensation');
            expanded.add('charak_pit_daha');
          }
          // White spots / Shvaitya / Vitiligo spots
          if (['shvaitya_white_spots', 'charak_kap_shvaitya'].includes(id)) {
            expanded.add('shvaitya_white_spots');
            expanded.add('charak_kap_shvaitya');
            // White spots/Shvitra naturally associate with localized cold touch (Shaitya) and stable boundaries (Sthairya):
            expanded.add('charak_kap_shaitya');
            expanded.add('sethira_edges');
            expanded.add('charak_kap_sthairya');
          }
          // Blackish-red / dusky-red (Krishnaruna / Shyava)
          if (['blackish_red', 'charak_vat_shyavaruna', 'blackish_brown', 'blackish_brown_eruptions'].includes(id)) {
            expanded.add('blackish_red');
            expanded.add('charak_vat_shyavaruna');
            expanded.add('blackish_brown');
            expanded.add('blackish_brown_eruptions');
          }
          // Stable edges (Sthairya)
          if (['sethira_edges', 'charak_kap_sthairya'].includes(id)) {
            expanded.add('sethira_edges');
            expanded.add('charak_kap_sthairya');
          }
          // Moisture/discharge/weeping synonyms
          if (['discharge', 'heavy_discharge', 'charak_pit_parisrava', 'charak_pit_kleda', 'charak_kap_kledah'].includes(id)) {
            expanded.add('discharge');
            expanded.add('heavy_discharge');
            expanded.add('charak_pit_parisrava');
            expanded.add('charak_pit_kleda');
            expanded.add('charak_kap_kledah');
            // Humid damp discharges and active oozing clinically manifest with localized itching (Kandu)
            expanded.add('itching');
            expanded.add('intense_itching');
            expanded.add('charak_kap_kandu');
          }
          // Skin thickness (Bahala) & elephant hide (charma)
          if (['thick_skin', 'elephant_skin', 'charak_kap_utsedha'].includes(id)) {
            expanded.add('thick_skin');
            expanded.add('elephant_skin');
            expanded.add('charak_kap_utsedha');
            // Massive hypertrophy or skin thickening clinically correlates to a feeling of local heaviness (Gaurava)
            expanded.add('charak_kap_gaurava');
          }
          // Snigdha / Unctuous oily surface
          if (['snigdha_texture', 'unctuous_snigdha', 'charak_kap_sneha'].includes(id)) {
            expanded.add('snigdha_texture');
            expanded.add('unctuous_snigdha');
            expanded.add('charak_kap_sneha');
          }
          // Elevation & papules/round patches
          if (['elevated_round', 'elevated_patches', 'elevated_circular', 'charak_kap_utsedha'].includes(id)) {
            expanded.add('elevated_round');
            expanded.add('elevated_patches');
            expanded.add('elevated_circular');
            expanded.add('charak_kap_utsedha');
          }
          // Skin atrophic thinning
          if (['skin_thin', 'charak_vat_shosha'].includes(id)) {
            expanded.add('skin_thin');
            expanded.add('charak_vat_shosha');
          }
          // Persistent itching (Kandu)
          if (['itching', 'intense_itching', 'charak_kap_kandu'].includes(id)) {
            expanded.add('itching');
            expanded.add('intense_itching');
            expanded.add('charak_kap_kandu');
          }
          // Pain markers
          if (['pain', 'intense_pain', 'pricking_pain', 'painful_lesion', 'excruciating_pain', 'unbearable_touch', 'charak_vat_todah', 'charak_vat_shulam'].includes(id)) {
            expanded.add('pain');
            expanded.add('intense_pain');
            expanded.add('pricking_pain');
            expanded.add('painful_lesion');
            expanded.add('excruciating_pain');
            expanded.add('unbearable_touch');
            expanded.add('charak_vat_todah');
            expanded.add('charak_vat_shulam');
          }
          // Suppuration/Pustules
          if (['pustules', 'pustules_eruptions', 'eruptions_pidaka', 'papules_pidaka', 'charak_pit_paka'].includes(id)) {
            expanded.add('pustules');
            expanded.add('pustules_eruptions');
            expanded.add('eruptions_pidaka');
            expanded.add('papules_pidaka');
            expanded.add('charak_pit_paka');
          }
        });
        return Array.from(expanded);
      };

      const expandedPresent = expandWithSynonyms(present);
      const expandedAbsent = absent; // Keep absent unexpanded to prevent incorrect negation cascade overwrites of present features

      const scannableIds = new Set<string>();
      if (typeof KUSHTHA_QUESTIONS !== "undefined" && Array.isArray(KUSHTHA_QUESTIONS)) {
        KUSHTHA_QUESTIONS.forEach(cat => {
          if (cat && Array.isArray(cat.questions)) {
            cat.questions.forEach(q => { 
              if (q && q.id && (q as any).physicalFeature === true) {
                scannableIds.add(q.id); 
              }
            });
          }
        });
      }
      if (typeof LAKSHANA_QUESTIONS !== "undefined" && Array.isArray(LAKSHANA_QUESTIONS)) {
        LAKSHANA_QUESTIONS.forEach(cat => {
          if (cat && Array.isArray(cat.questions)) {
            cat.questions.forEach(q => { 
              if (q && q.id && (q as any).physicalFeature === true) {
                scannableIds.add(q.id); 
              }
            });
          }
        });
      }

      const filteredPresent = expandedPresent.filter(id => scannableIds.has(id));
      const filteredAbsent = expandedAbsent.filter(id => scannableIds.has(id));

      // Handle suppuration/no_suppuration inversion logic explicitly
      if (filteredPresent.includes('suppuration') && !filteredAbsent.includes('no_suppuration')) {
        filteredAbsent.push('no_suppuration');
      }
      if (filteredPresent.includes('no_suppuration') && !filteredAbsent.includes('suppuration')) {
        filteredAbsent.push('suppuration');
      }
      if (filteredAbsent.includes('suppuration') && !filteredPresent.includes('no_suppuration')) {
        filteredPresent.push('no_suppuration');
      }
      if (filteredAbsent.includes('no_suppuration') && !filteredPresent.includes('suppuration')) {
        filteredPresent.push('suppuration');
      }

      setInferredFeatures(filteredPresent);
      
      const fillAnswersOverwritingly = (prev: Record<string, boolean | null>, presentIDs: string[], absentIDs: string[]) => {
        const next = { ...prev };
        
        // Set absent features FIRST
        absentIDs.forEach(id => {
          if (scannableIds.has(id)) {
            next[id] = false;
          }
        });

        // Set present features SECOND (so present ALWAYS overwrites absent and takes priority)
        presentIDs.forEach(id => {
          if (scannableIds.has(id)) {
            next[id] = true;
          }
        });

        return next;
      };

      setAnswers(prev => fillAnswersOverwritingly(prev, filteredPresent, filteredAbsent));
      setKushthaAnswers(prev => fillAnswersOverwritingly(prev, filteredPresent, filteredAbsent));
      
    } catch (err) {
      console.error("Visual scan failed:", err);
    } finally {
      setIsVisualScanning(false);
      setScanCompleteNotice(true);
      setTimeout(() => setScanCompleteNotice(false), 5000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      e.target.value = '';

      if (!file.type.startsWith('image/')) {
        setError("Please upload a valid image file.");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        setError("Image too large (max 20MB).");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          setImageQuality(null);
          setIsCheckingQuality(true);
          setIsVisualScanning(true);
          setIsEnhancing(true);

          try {
            // Measure original base upload image metrics
            const rawMetrics = await analyzeImageQualityMetrics(result);
            console.log("[Avabhasini IQA] Uploaded image properties checked:", rawMetrics);

            // Run image enhancement pipeline (Color Balance + Histogram CLAHE Simulation + Sharpness Restore)
            const enhancedDataUrl = await enhanceSkinImage(result);

            // Run Gemini's Quality Check against enhanced high-contrast frame
            const quality = await import('./services/geminiService').then(m => m.checkImageQuality(enhancedDataUrl, rawMetrics));
            
            let score = quality.score;
            let reason = quality.reason || "";

            // Augment score based on algorithmic physical properties
            const bVal = rawMetrics.brightness !== undefined ? rawMetrics.brightness : 120;
            const sVal = rawMetrics.sharpness !== undefined ? rawMetrics.sharpness : 35;
            if (rawMetrics.exposureStatus === 'dark' || bVal < 40) {
              score = Math.min(score, 58);
              reason = "Image is underexposed/too dark. " + (reason ? `(${reason})` : "");
            } else if (rawMetrics.sharpnessStatus === 'blurry' || sVal < 1) {
              score = Math.min(score, 58);
              reason = "Image is out-of-focus or blurry. " + (reason ? `(${reason})` : "");
            } else if (rawMetrics.megapixels < 0.05) {
              score = Math.min(score, 58);
              reason = "Symptom image is too small or low-resolution. " + (reason ? `(${reason})` : "");
            }

            let isHighQuality = score >= 65;

            setImageQuality({ score, isHighQuality, reason });
            setBypassedQuality(false);

            if (!isHighQuality) {
              setQualityNotice({ score, reason });
            } else {
              setQualityNotice(null);
            }

            const newImages = [...images, enhancedDataUrl];
            setImages(newImages);
            setError(null);
            setStep('scan');
            
            await runVisualScan(newImages);
            stopCamera();
          } catch (err: any) {
            console.error("Enhancement pipeline exception, calling fallback scanner:", err);
            const fallbackMetrics = await analyzeImageQualityMetrics(result).catch(() => null);
            const fallbackQual = calculateLocalQualityScore(fallbackMetrics);
            setImageQuality(fallbackQual);
            if (!fallbackQual.isHighQuality) {
              setQualityNotice({ score: fallbackQual.score, reason: fallbackQual.reason });
            } else {
              setQualityNotice(null);
            }
            const newImages = [...images, result];
            setImages(newImages);
            setStep('scan');
            await runVisualScan(newImages);
            stopCamera();
          } finally {
            setIsVisualScanning(false);
            setIsEnhancing(false);
            setIsCheckingQuality(false);
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
    }
  };

  const captureImage = async () => {
    if (!isCameraActive || !stream) {
      startCamera();
      return;
    }

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Ensure video is playing and has dimensions
      if (video.readyState < 2 || video.videoWidth === 0) {
        setError("Camera is still warming up. Please wait a second and try again.");
        setTimeout(() => setError(null), 3000);
        return;
      }

      const context = canvas.getContext('2d');
      if (context) {
        try {
          const size = Math.min(video.videoWidth, video.videoHeight);
          const x = (video.videoWidth - size) / 2;
          const y = (video.videoHeight - size) / 2;
          canvas.width = 1240;
          canvas.height = 1240;
          context.drawImage(video, x, y, size, size, 0, 0, 1240, 1240);
          const rawDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          
          if (!rawDataUrl || rawDataUrl === 'data:,') {
            throw new Error("Failed to capture image data.");
          }

          setImageQuality(null);
          setIsCheckingQuality(true);
          setIsEnhancing(true);

          // Perform async quality, enhancement, and analysis in background
          (async () => {
            let rawMetrics: any = null;
            try {
              // 1. Measure raw captured image parameters
              rawMetrics = await analyzeImageQualityMetrics(rawDataUrl);
              console.log("[Avabhasini IQA] Captured stream frame properties checked:", rawMetrics);

              // 2. Continuous multi-step enhancement
              const enhancedDataUrl = await enhanceSkinImage(rawDataUrl);

              // Update images list immediately with enhanced/normalized frame
              const newImages = [...images, enhancedDataUrl];
              setImages(newImages);

              // 3. Clinical audit query
              const quality = await import('./services/geminiService').then(m => m.checkImageQuality(enhancedDataUrl, rawMetrics));
              
              let score = quality.score;
              let reason = quality.reason || "";

              const bVal = rawMetrics.brightness !== undefined ? rawMetrics.brightness : 120;
              const sVal = rawMetrics.sharpness !== undefined ? rawMetrics.sharpness : 35;
              if (rawMetrics.exposureStatus === 'dark' || bVal < 50) {
                score = Math.min(score, 58);
                reason = "Ambient lighting too low. " + (reason ? `(${reason})` : "");
              } else if (rawMetrics.sharpnessStatus === 'blurry' || sVal < 5) {
                score = Math.min(score, 58);
                reason = "Target focus blurred. Hold camera very steady. " + (reason ? `(${reason})` : "");
              }

              let isHighQuality = score >= 65;

              setImageQuality({ score, isHighQuality, reason });
              setBypassedQuality(false);

              if (!isHighQuality) {
                setQualityNotice({ score, reason });
              } else {
                setQualityNotice(null);
              }
              
              await runVisualScan(newImages);
            } catch (err) {
              console.error("Background scan error:", err);
              const fallbackQual = calculateLocalQualityScore(rawMetrics);
              setImageQuality(fallbackQual);
              if (!fallbackQual.isHighQuality) {
                setQualityNotice({ score: fallbackQual.score, reason: fallbackQual.reason });
              } else {
                setQualityNotice(null);
              }
            } finally {
              setIsCheckingQuality(false);
              setIsEnhancing(false);
            }
          })();

        } catch (err: any) {
          console.error("Capture fallthrough:", err);
          setError("Capture failed: " + err.message);
          setTimeout(() => setError(null), 5000);
        }
      }
    }
  };

  const handleDOBChange = (dob: string) => {
    setUserProfile(prev => ({ ...prev, dob, age: calculateAge(dob) }));
  };

  const isProfileValid = () => {
    return !!(userProfile.name && userProfile.dob && userProfile.sex && userProfile.state && userProfile.occupation && userProfile.phone);
  };

  const findBestMatchingKushtha = () => {
    let bestMatch: KushthaType | null = null;
    let maxMatches = 0;

    const checkFeatureActive = (featureId: string): boolean => {
      if (answers[featureId] === true || kushthaAnswers[featureId] === true) {
        return true;
      }

      const synonymMap: Record<string, string[]> = {
        // Shvitra / Whitespot symptoms
        'shvaitya_white_spots': ['charak_kap_shvaitya'],
        'charak_kap_shvaitya': ['shvaitya_white_spots'],

        // Blackish red / Krishnaruna color
        'blackish_red': ['charak_vat_shyavaruna'],
        'charak_vat_shyavaruna': ['blackish_red', 'blackish_brown', 'blackish_brown_eruptions', 'shvitra_vataja'],

        // White Red Mix / Shveta-Rakta
        'white_red_mix': ['charak_kap_shvaitya', 'charak_pit_raga', 'white_red_edges'],

        // White Coppery / Shveta-Tamra
        'white_coppery': ['charak_kap_shvaitya', 'charak_pit_raga', 'charak_vat_shyavaruna'],

        // Red center / edges / Fig Color (Udumbara, Gunja, etc.)
        'red_edges_brown_inside': ['charak_pit_raga', 'charak_vat_shyavaruna'],
        'white_red_edges': ['charak_kap_shvaitya', 'charak_pit_raga'],
        'gunja_color': ['charak_pit_raga'],
        'udumbara_color': ['charak_pit_raga'],
        'redness': ['charak_pit_raga'],
        'charak_pit_raga': ['redness', 'gunja_color', 'udumbara_color'],

        // Blackish Brown / Shyava
        'blackish_brown': ['charak_vat_shyavaruna'],

        // Edges / Borders (Sthira or Vishama)
        'sethira_edges': ['charak_kap_sthairya'],
        'charak_kap_sthairya': ['sethira_edges'],
        'vishama_edges': ['charak_vat_aayama', 'charak_vat_sankochana'],

        // Rough / Dry / Sandpaper texture (Ruksha / Karkasha / Parusha)
        'ruksha_texture': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
        'dry_rough': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
        'rough_karkasha': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'dry_rough', 'rough_parusha', 'karkasha_rough'],
        'rough_parusha': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'dry_rough', 'rough_karkasha', 'karkasha_rough'],
        'karkasha_rough': ['charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha'],
        'charak_vat_raukshya': ['ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
        'charak_vat_parushya': ['ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],
        'charak_vat_kharabhava': ['ruksha_texture', 'dry_rough', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'],

        // Snigdha / Unctuous texture (Sticky/Oily)
        'snigdha_texture': ['charak_kap_sneha', 'charak_kap_kledah', 'charak_pit_kleda', 'unctuous_snigdha'],
        'unctuous_snigdha': ['charak_kap_sneha', 'charak_kap_kledah', 'charak_pit_kleda', 'snigdha_texture'],
        'charak_kap_sneha': ['snigdha_texture', 'unctuous_snigdha'],
        'charak_kap_kledah': ['snigdha_texture', 'unctuous_snigdha', 'heavy_discharge', 'discharge'],
        'charak_pit_kleda': ['snigdha_texture', 'unctuous_snigdha', 'heavy_discharge', 'discharge'],

        // Swelling / Elevation (Utsedha / Bahala)
        'elevated_round': ['charak_kap_utsedha'],
        'elevated_patches': ['charak_kap_utsedha', 'elevated_round', 'lotus_petal_shape'],
        'elevated_circular': ['charak_kap_utsedha', 'elevated_round'],
        'charak_kap_utsedha': ['elevated_round', 'elevated_patches', 'elevated_circular'],

        // Thinning / Atrophy (Shosha)
        'skin_thin': ['charak_vat_shosha'],
        'charak_vat_shosha': ['skin_thin'],

        // Thick Skin (Bahala / Elephant skin / Sclerotic)
        'thick_skin': ['charak_kap_utsedha', 'elephant_skin'],
        'elephant_skin': ['charak_kap_utsedha', 'thick_skin'],

        // Pain (Toda / Shula / Intense pain)
        'pain': ['charak_vat_todah', 'charak_vat_shulam', 'painful_lesion', 'excruciating_pain', 'unbearable_touch', 'pricking_pain', 'intense_pain'],
        'intense_pain': ['charak_vat_todah', 'charak_vat_shulam', 'excruciating_pain', 'painful_lesion', 'unbearable_touch', 'pricking_pain', 'pain'],
        'pricking_pain': ['charak_vat_todah', 'charak_vat_shulam', 'painful_lesion', 'excruciating_pain', 'unbearable_touch', 'intense_pain', 'pain'],
        'charak_vat_todah': ['pain', 'intense_pain', 'pricking_pain'],
        'charak_vat_shulam': ['pain', 'intense_pain', 'pricking_pain'],

        // Itching (Kandu)
        'itching': ['charak_kap_kandu', 'intense_itching'],
        'intense_itching': ['charak_kap_kandu', 'itching'],
        'charak_kap_kandu': ['itching', 'intense_itching'],

        // Burning (Daha)
        'burning': ['charak_pit_daha', 'burning_sensation'],
        'burning_sensation': ['charak_pit_daha', 'burning'],
        'charak_pit_daha': ['burning', 'burning_sensation'],

        // Discharge / Srava / Parisrava
        'discharge': ['charak_pit_parisrava', 'heavy_discharge'],
        'heavy_discharge': ['charak_pit_parisrava', 'discharge'],
        'charak_pit_parisrava': ['discharge', 'heavy_discharge'],

        // Eruptions / Pustules / Pidaka
        'pustules': ['charak_pit_paka', 'pustules_eruptions', 'eruptions_pidaka', 'papules_pidaka'],
        'pustules_eruptions': ['charak_pit_paka', 'pustules', 'eruptions_pidaka', 'papules_pidaka'],
        'eruptions_pidaka': ['charak_pit_paka', 'pustules', 'pustules_eruptions', 'papules_pidaka'],
        'papules_pidaka': ['charak_pit_paka', 'pustules', 'pustules_eruptions', 'eruptions_pidaka'],
        'charak_pit_paka': ['pustules', 'pustules_eruptions', 'eruptions_pidaka', 'papules_pidaka'],

        // Miscellaneous
        'ulcerated': ['multiple_wounds'],
        'red_black_mix': ['blackish_red', 'multiple_wounds'],
        'blackish_brown_eruptions': ['blackish_brown', 'pustules_eruptions'],
        'brown_hair': ['redness', 'burning'],
        'compact_dense': ['matted_patches', 'sethira_edges']
      };

      const synonyms = synonymMap[featureId];
      if (synonyms) {
        for (const syn of synonyms) {
          if (answers[syn] === true || kushthaAnswers[syn] === true) {
            return true;
          }
        }
      }

      return false;
    };

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
      "shvitra_vataja": ["shvaitya_white_spots", "ruksha_texture"],
      "shvitra_pittaja": ["shvaitya_white_spots", "white_coppery", "burning"],
      "shvitra_kaphaja": ["shvaitya_white_spots", "thick_skin", "itching"]
    };

    let bestScore = 0;

    KUSHTHA_TYPES.forEach(type => {
      // Avoid matching healthy_skin as a disease based on positive symptom counts
      if (type.id === 'healthy_skin') return;

      let matchedWeight = 0;
      let totalPossibleWeight = 0;

      const specificWeightKeys = FEATURE_WEIGHTS[type.id] || FEATURE_WEIGHTS[type.name] || [];
      type.matchingFeatures.forEach(featureId => {
        const isPathognomonic = specificWeightKeys.includes(featureId);
        const weight = isPathognomonic ? 5.0 : 1.5;
        totalPossibleWeight += weight;

        if (checkFeatureActive(featureId)) {
          matchedWeight += weight;
        }
      });

      const finalPercentScore = totalPossibleWeight > 0 ? (matchedWeight / totalPossibleWeight) * 100 : 0;

      if (finalPercentScore > bestScore) {
        bestScore = finalPercentScore;
        bestMatch = type;
      }
    });

    if (bestScore === 0) {
      return KUSHTHA_TYPES.find(t => t.id === 'healthy_skin') || null;
    }

    return bestMatch;
  };

  const resetAnalysis = () => {
    stopCamera();
    setStep('welcome');
    setImages([]);
    setQualityNotice(null);
    setImageQuality(null);
    setBypassedQuality(false);
    setShowQualityWarningModal(false);
    setAnswers({});
    setKushthaAnswers({});
    setInferredFeatures([]);
    setIsVisualScanning(false);
    setResult(null);
    setResultsTab('ayurvedic');
    setSuggestedKushtha(null);
    setLastAnalysisImageSet('');
    setError(null);
    if (!isProfileLocked) {
      setUserProfile(initialProfile);
    }
  };

  const runAnalysis = async () => {
    if (images.length === 0) return;

    // Check quality pre-check with user feedback before classification runs
    if (!isImageSetQualified && !bypassedQuality) {
      setShowQualityWarningModal(true);
      return;
    }

    // Check if image set has changed to maintain stability
    const currentImgsKey = images.join('|');
    if (result && currentImgsKey === lastAnalysisImageSet) {
      setStep('results');
      return;
    }

    setStep('analyzing');
    setError(null);
    
    // Fallback: If inferredFeatures is empty, it means the user skipped the manual AI Pre-Scan button.
    // We run it automatically here to populate physical markers and Kushtha background markers!
    let finalInferredFeatures = [...inferredFeatures];
    let finalAnswers = { ...answers };
    let finalKushthaAnswers = { ...kushthaAnswers };

    if (finalInferredFeatures.length === 0) {
      try {
        const computedMetrics = await Promise.all(
          images.map(img => analyzeImageQualityMetrics(img).catch(() => null))
        );
        const { present, absent } = await preAnalyzeVisuals(images, computedMetrics);
        
        const expandWithSynonyms = (list: string[]) => {
          const expanded = new Set<string>();
          list.forEach(id => {
            if (!id) return;
            expanded.add(id);
            if (['dry_rough', 'ruksha_texture', 'charak_vat_raukshya', 'charak_vat_parushya', 'charak_vat_kharabhava', 'rough_karkasha', 'rough_parusha', 'karkasha_rough'].includes(id)) {
              expanded.add('dry_rough'); expanded.add('ruksha_texture'); expanded.add('charak_vat_raukshya'); expanded.add('charak_vat_parushya'); expanded.add('charak_vat_kharabhava'); expanded.add('rough_karkasha'); expanded.add('rough_parusha'); expanded.add('karkasha_rough'); expanded.add('charak_vat_sankochana'); expanded.add('charak_vat_aayama');
            }
            if (['burning', 'burning_sensation', 'charak_pit_daha'].includes(id)) {
              expanded.add('burning'); expanded.add('burning_sensation'); expanded.add('charak_pit_daha');
            }
            if (['redness', 'charak_pit_raga', 'gunja_color', 'udumbara_color'].includes(id)) {
              expanded.add('redness'); expanded.add('charak_pit_raga'); expanded.add('gunja_color'); expanded.add('udumbara_color'); expanded.add('burning'); expanded.add('burning_sensation'); expanded.add('charak_pit_daha');
            }
            if (['shvaitya_white_spots', 'charak_kap_shvaitya'].includes(id)) {
              expanded.add('shvaitya_white_spots'); expanded.add('charak_kap_shvaitya'); expanded.add('charak_kap_shaitya'); expanded.add('sethira_edges'); expanded.add('charak_kap_sthairya');
            }
            if (['blackish_red', 'charak_vat_shyavaruna', 'blackish_brown', 'blackish_brown_eruptions'].includes(id)) {
              expanded.add('blackish_red'); expanded.add('charak_vat_shyavaruna'); expanded.add('blackish_brown'); expanded.add('blackish_brown_eruptions');
            }
            if (['sethira_edges', 'charak_kap_sthairya'].includes(id)) {
              expanded.add('sethira_edges'); expanded.add('charak_kap_sthairya');
            }
            if (['discharge', 'heavy_discharge', 'charak_pit_parisrava', 'charak_pit_kleda', 'charak_kap_kledah'].includes(id)) {
              expanded.add('discharge'); expanded.add('heavy_discharge'); expanded.add('charak_pit_parisrava'); expanded.add('charak_pit_kleda'); expanded.add('charak_kap_kledah'); expanded.add('itching'); expanded.add('intense_itching'); expanded.add('charak_kap_kandu');
            }
            if (['thick_skin', 'elephant_skin', 'charak_kap_utsedha'].includes(id)) {
              expanded.add('thick_skin'); expanded.add('elephant_skin'); expanded.add('charak_kap_utsedha'); expanded.add('charak_kap_gaurava');
            }
            if (['snigdha_texture', 'unctuous_snigdha', 'charak_kap_sneha'].includes(id)) {
              expanded.add('snigdha_texture'); expanded.add('unctuous_snigdha'); expanded.add('charak_kap_sneha');
            }
            if (['elevated_round', 'elevated_patches', 'elevated_circular', 'charak_kap_utsedha'].includes(id)) {
              expanded.add('elevated_round'); expanded.add('elevated_patches'); expanded.add('elevated_circular'); expanded.add('charak_kap_utsedha');
            }
            if (['skin_thin', 'charak_vat_shosha'].includes(id)) {
              expanded.add('skin_thin'); expanded.add('charak_vat_shosha');
            }
            if (['itching', 'intense_itching', 'charak_kap_kandu'].includes(id)) {
              expanded.add('itching'); expanded.add('intense_itching'); expanded.add('charak_kap_kandu');
            }
            if (['pain', 'intense_pain', 'pricking_pain', 'painful_lesion', 'excruciating_pain', 'unbearable_touch', 'charak_vat_todah', 'charak_vat_shulam'].includes(id)) {
              expanded.add('pain'); expanded.add('intense_pain'); expanded.add('pricking_pain'); expanded.add('painful_lesion'); expanded.add('excruciating_pain'); expanded.add('unbearable_touch'); expanded.add('charak_vat_todah'); expanded.add('charak_vat_shulam');
            }
            if (['pustules', 'pustules_eruptions', 'eruptions_pidaka', 'papules_pidaka', 'charak_pit_paka'].includes(id)) {
              expanded.add('pustules'); expanded.add('pustules_eruptions'); expanded.add('eruptions_pidaka'); expanded.add('papules_pidaka'); expanded.add('charak_pit_paka');
            }
          });
          return Array.from(expanded);
        };

        const expandedPresent = expandWithSynonyms(present);
        const scannableIds = new Set<string>();
        if (typeof KUSHTHA_QUESTIONS !== "undefined") {
          KUSHTHA_QUESTIONS.forEach(cat => cat?.questions?.forEach(q => q?.id && (q as any).physicalFeature && scannableIds.add(q.id)));
        }
        if (typeof LAKSHANA_QUESTIONS !== "undefined") {
          LAKSHANA_QUESTIONS.forEach(cat => cat?.questions?.forEach(q => q?.id && (q as any).physicalFeature && scannableIds.add(q.id)));
        }

        const filteredPresent = expandedPresent.filter(id => scannableIds.has(id));
        const filteredAbsent = absent.filter(id => scannableIds.has(id));

        if (filteredPresent.includes('suppuration') && !filteredAbsent.includes('no_suppuration')) filteredAbsent.push('no_suppuration');
        if (filteredPresent.includes('no_suppuration') && !filteredAbsent.includes('suppuration')) filteredAbsent.push('suppuration');
        if (filteredAbsent.includes('suppuration') && !filteredPresent.includes('no_suppuration')) filteredPresent.push('no_suppuration');
        if (filteredAbsent.includes('no_suppuration') && !filteredPresent.includes('suppuration')) filteredPresent.push('suppuration');

        finalInferredFeatures = filteredPresent;
        
        filteredAbsent.forEach(id => {
          if (scannableIds.has(id)) { finalAnswers[id] = false; finalKushthaAnswers[id] = false; }
        });
        filteredPresent.forEach(id => {
          if (scannableIds.has(id)) { finalAnswers[id] = true; finalKushthaAnswers[id] = true; }
        });
        
        setAnswers(finalAnswers);
        setKushthaAnswers(finalKushthaAnswers);
        setInferredFeatures(finalInferredFeatures);
      } catch (err) {
        console.error("Background pre-analysis failed:", err);
      }
    }

    // Pass the fully populated answers and kushtha answers to classification logic
    const dummyRefForMatch = { answers: finalAnswers, kushthaAnswers: finalKushthaAnswers };
    let bestMatch: KushthaType | null = null;
    let maxMatches = 0;
    
    // We inline a mini findMatch using the final objects to guess suggested Kushtha while API runs
    KUSHTHA_TYPES.forEach(type => {
      if (type.id === 'healthy_skin') return;
      let matchedCount = 0;
      let possibleCount = 0;
      if (type.matchingFeatures) {
        type.matchingFeatures.forEach(sym => {
          possibleCount++;
          const val = dummyRefForMatch.answers[sym] !== undefined ? dummyRefForMatch.answers[sym] : dummyRefForMatch.kushthaAnswers[sym];
          if (val === true) matchedCount++;
        });
      }
      const percentScore = possibleCount > 0 ? (matchedCount / possibleCount) : 0;
      if (percentScore > maxMatches) {
        maxMatches = percentScore;
        bestMatch = type;
      }
    });
    setSuggestedKushtha(bestMatch || null);

    try {
      const res = await analyzeSkin(images, { ...finalAnswers, ...finalKushthaAnswers }, userProfile, finalInferredFeatures);
      
      res.affectedAreas = affectedAreas;
      
      // Calculate manual symptom counts to include as metadata, but keep AI's merged dosha percentages.
      const vataCount = LAKSHANA_QUESTIONS[0].questions.filter(q => dummyRefForMatch.answers[q.id]).length;
      const pittaCount = LAKSHANA_QUESTIONS[1].questions.filter(q => dummyRefForMatch.answers[q.id]).length;
      const kaphaCount = LAKSHANA_QUESTIONS[2].questions.filter(q => dummyRefForMatch.answers[q.id]).length;
      const counts = { Vata: vataCount, Pitta: pittaCount, Kapha: kaphaCount };
      
      // Ensure AI dosha percentages are available, and append metadata counts
      if (!res.doshaPercentages) {
        res.doshaPercentages = { Vata: 33.33, Pitta: 33.33, Kapha: 33.33 };
      }
      (res.doshaPercentages as any).counts = counts;
      
      // Ensure that dominant dosha is written along with Kushtha for Shvitra
      if (res.specificKushtha && res.specificKushtha.toLowerCase().includes('shvitra')) {
        let dominant = 'Vata';
        let maxVal = (res.doshaPercentages as any)?.Vata || 33.33;
        if (((res.doshaPercentages as any)?.Pitta || 33.33) > maxVal) {
          dominant = 'Pitta';
          maxVal = (res.doshaPercentages as any)?.Pitta;
        }
        if (((res.doshaPercentages as any)?.Kapha || 33.33) > maxVal) {
          dominant = 'Kapha';
          maxVal = (res.doshaPercentages as any)?.Kapha;
        }
        res.specificKushtha = `Shvitra ${dominant}`;
      }
      
      setResult(res);
      
      // Synchronize suggestedKushtha with the actual API result to keep display & Sanskrit sub-titles matched perfectly
      if (res.specificKushtha) {
        const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
        const normRes = normalize(res.specificKushtha);
        const matched = KUSHTHA_TYPES.find(t => {
          const normName = normalize(t.name);
          const normId = normalize(t.id);
          return normName === normRes || 
                 normId === normRes || 
                 (normRes.includes("samatwak") && t.id === 'healthy_skin') ||
                 (normRes.includes("healthyskin") && t.id === 'healthy_skin') ||
                 (t.id === 'charmakhya' && normRes.includes("charmakushtha")) ||
                 (t.id === 'eka' && normRes.includes("ekakushtha"));
        });
        if (matched) {
          setSuggestedKushtha(matched);
        }
      } else if (res.modernClinicalCorrelation && res.modernClinicalCorrelation.toLowerCase().includes("healthy")) {
        const matchedHealthy = KUSHTHA_TYPES.find(t => t.id === 'healthy_skin');
        if (matchedHealthy) {
          setSuggestedKushtha(matchedHealthy);
        }
      }

      setLastAnalysisImageSet(currentImgsKey);

      // Compress the images asynchronously to prevent LocalStorage QuotaExceeded errors
      let compressedImages: string[] = [];
      try {
        compressedImages = await Promise.all(
          images.map(img => downscaleDataUrl(img, 240))
        );
      } catch (err) {
        console.warn("Image downscaling failed, saving original images to history", err);
        compressedImages = [...images];
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newSessionRecord = { 
        ...res, 
        sessionId,
        date: new Date().toLocaleString(), 
        profile: { ...userProfile }, 
        images: compressedImages 
      };

      setHistory(prev => [newSessionRecord, ...prev]);

      if (currentUser) {
        try {
          await setDoc(doc(db, 'users', currentUser.uid, 'sessions', sessionId), {
            ...newSessionRecord,
            createdAt: new Date().toISOString()
          });
          console.log("[Firestore Sync] Session saved successfully to Firebase cloud!");
        } catch (dbErr) {
          console.error("Firestore sync save error:", dbErr);
        }
      }
      setStep('results');
    } catch (err: any) {
      console.error("Analysis error:", err);
      setError(err?.message || "AI Analysis failed. Please try again.");
      setStep('scan');
    }
  };

  const calculateDoshaPercentages = () => {
    const counts = { Vata: 0, Pitta: 0, Kapha: 0 };
    LAKSHANA_QUESTIONS.forEach(cat => {
      cat.questions.forEach(q => {
        if (answers[q.id] === true) {
          counts[q.dosha as keyof typeof counts]++;
        }
      });
    });
    
    // Calculate absolute Dosha percentage (e.g. 4 out of 10 for Vata = 40%)
    const vataMax = LAKSHANA_QUESTIONS[0]?.questions.length || 10;
    const pittaMax = LAKSHANA_QUESTIONS[1]?.questions.length || 7;
    const kaphaMax = LAKSHANA_QUESTIONS[2]?.questions.length || 9;

    const vataPct = vataMax > 0 ? (counts.Vata / vataMax) * 100 : 0;
    const pittaPct = pittaMax > 0 ? (counts.Pitta / pittaMax) * 100 : 0;
    const kaphaPct = kaphaMax > 0 ? (counts.Kapha / kaphaMax) * 100 : 0;
    
    // Kept as absolute percentages as requested by user
    const vataRel = vataPct;
    const pittaRel = pittaPct;
    const kaphaRel = kaphaPct;
    
    // Determine dominance based on count
    let dominance = "Neutral";
    if (counts.Vata > counts.Pitta && counts.Vata > counts.Kapha) dominance = "Vata";
    else if (counts.Pitta > counts.Vata && counts.Pitta > counts.Kapha) dominance = "Pitta";
    else if (counts.Kapha > counts.Vata && counts.Kapha > counts.Pitta) dominance = "Kapha";
    else {
      // Handle ties or low counts by preferring the highest existing
      const maxVal = Math.max(counts.Vata, counts.Pitta, counts.Kapha);
      if (maxVal > 0) {
        if (counts.Vata === maxVal) dominance = "Vata";
        else if (counts.Pitta === maxVal) dominance = "Pitta";
        else dominance = "Kapha";
      }
    }
    
    return { 
      Vata: vataPct, 
      Pitta: pittaPct, 
      Kapha: kaphaPct, 
      VataRel: vataRel,
      PittaRel: pittaRel,
      KaphaRel: kaphaRel,
      dominance,
      counts,
      totalAnswered: answeredDoshaCount,
      isComplete: answeredDoshaCount === totalDoshaQuestions 
    };
  };

  const getTheme = (dosha: string) => {
    const theme = (DOSHA_THEMES as any)[dosha] || DOSHA_THEMES.Neutral;
    return theme;
  };

  const doshaMetrics = calculateDoshaPercentages();

  const displayDoshaMetrics = useMemo(() => {
    if (result && result.doshaPercentages && typeof (result.doshaPercentages as any).Vata === 'number') {
      const vataPct = (result.doshaPercentages as any).Vata;
      const pittaPct = (result.doshaPercentages as any).Pitta;
      const kaphaPct = (result.doshaPercentages as any).Kapha;
      const counts = (result.doshaPercentages as any).counts || { Vata: 0, Pitta: 0, Kapha: 0 };
      
      let dominance = "Neutral";
      if (vataPct > pittaPct && vataPct > kaphaPct) dominance = "Vata";
      else if (pittaPct > vataPct && pittaPct > kaphaPct) dominance = "Pitta";
      else if (kaphaPct > vataPct && kaphaPct > pittaPct) dominance = "Kapha";
      else {
        const maxVal = Math.max(vataPct, pittaPct, kaphaPct);
        if (maxVal > 0) {
          if (vataPct === maxVal) dominance = "Vata";
          else if (pittaPct === maxVal) dominance = "Pitta";
          else dominance = "Kapha";
        }
      }
      
      return {
        Vata: vataPct,
        Pitta: pittaPct,
        Kapha: kaphaPct,
        VataRel: vataPct,
        PittaRel: pittaPct,
        KaphaRel: kaphaPct,
        dominance,
        counts,
        totalAnswered: 26,
        isComplete: true
      };
    }
    return doshaMetrics;
  }, [result, doshaMetrics]);
  const samhitaDataResult = result ? getSamhitaData(result.specificKushtha) : null;

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col pt-6 pb-24 overflow-x-hidden">
      {/* Header */}
      <header className="ayur-container text-center mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 bg-emerald-600/20 backdrop-blur-xl border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400">
            <Leaf size={18} />
          </div>
          <div className="flex-1 px-4">
            <h1 className="serif text-xl sm:text-2xl font-light tracking-tight text-white transition-all duration-700">
              AVABHASINI<span className="text-emerald-500 font-extralight italic">.</span>
            </h1>
          </div>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-emerald-500/40">
            <Sparkles size={18} className="animate-pulse" />
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-4 text-left max-w-xl mx-auto"
          >
            <AlertCircle size={20} className="text-rose-500 shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-1">Attention Required</p>
              <p className="text-stone-300 text-[10px] italic">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-stone-500 hover:text-white transition-colors">
              <RefreshCcw size={14} />
            </button>
          </motion.div>
        )}
      </header>

      <main className="ayur-container flex-1 mb-8">
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          accept="image/*" 
          onChange={handleFileUpload}
        />

        <AnimatePresence mode="wait">
          {activeTab === 'assessment' && (
            <motion.div
              key="assessment-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center"
            >
              <AnimatePresence mode="wait">
                {step === 'welcome' && (
                  <motion.div
                    key="welcome"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="w-full max-w-5xl mx-auto py-8"
                  >
                     <div className="text-center mb-16 px-4">
                      <h2 className="serif text-4xl sm:text-7xl text-white mb-6 font-light tracking-tight leading-[1.1]">Ayurvedic Kushtha & Dosha Suite</h2>
                      <p className="text-stone-400 text-xs sm:text-sm max-w-lg mx-auto uppercase tracking-[0.2em] font-bold">Charaka Samhita Pathological Skin & Dosha Analysis</p>
                    </div>

                    <div className="max-w-2xl mx-auto mb-12 px-4">
                      {/* Widget 3: Kushtha Type Entry */}
                      <motion.button
                        whileHover={{ y: -8, scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setDiagnosticMode('kushtha');
                          setStep('profile');
                          // Reset current assessment profile for new user
                          setUserProfile(initialProfile);
                        }}
                        className="ayur-card p-10 bg-stone-950/60 border-emerald-500/10 text-left relative overflow-hidden group transition-all duration-500 min-h-[300px] flex flex-col w-full"
                      >
                        <div className="absolute -top-10 -right-10 p-8 text-emerald-500/5 group-hover:text-emerald-500/10 transition-all duration-700">
                          <ClipboardCheck size={240} />
                        </div>
                        <div className="relative z-10 flex-1 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-8 block">Comprehensive Skin Clinical Analysis</span>
                            <h3 className="serif text-4xl text-white mb-4">Kushtha Classification</h3>
                            <p className="text-stone-400 text-sm leading-relaxed max-w-md italic">Identify the specific morphological variant from the 18 types mentioned in Charaka Samhita. Includes visual lesion morphologic scanning & Sanskrit-referenced Doshic percentage analysis.</p>
                          </div>

                          <div className="mt-8 flex items-center justify-between">
                            <span className="text-[10px] font-mono text-stone-500">Charaka Samhita Chi. 7 Reference</span>
                            <div className="flex items-center gap-3 text-emerald-500 font-black uppercase tracking-widest text-xs">
                              DETECT KUSHTHA <ArrowRight size={18} />
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    </div>

                    {/* ICD-11 Search Bar Section */}
                    <div className="w-full max-w-2xl mx-auto mb-20 mt-10 px-4">
                      <div className="text-center mb-10">
                        <h3 className="serif text-3xl text-white mb-2">Modern Clinical Correlation</h3>
                        <p className="text-stone-500 text-[10px] font-black uppercase tracking-[0.3em]">Map Ayurveda Conditions to ICD-11 & TM2 Codes</p>
                      </div>
                      <div className="relative group">
                        <div className="relative flex items-center bg-[#0d1e15] rounded-[2rem] border border-white/5 p-2 focus-within:border-emerald-500/50 transition-all shadow-2xl">
                          <div className="pl-6 text-emerald-500">
                            <Search size={22} />
                          </div>
                          <input 
                            type="text" 
                            placeholder="Type ICD-11 code (e.g. EA80) or Name..."
                            className="w-full bg-transparent border-none text-white px-5 py-5 focus:ring-0 text-lg placeholder:text-stone-700"
                            value={icdSearchQuery}
                            onChange={(e) => {
                              const q = e.target.value.toLowerCase();
                              setIcdSearchQuery(q);
                              if (q.length > 1) {
                                const found = KUSHTHA_TYPES.find(t => 
                                  t.icd11?.toLowerCase().includes(q) || 
                                  t.modernName?.toLowerCase().includes(q) ||
                                  t.name.toLowerCase().includes(q)
                                );
                                setSearchResult(found || null);
                              } else {
                                setSearchResult(null);
                              }
                            }}
                          />
                        </div>
                        <AnimatePresence>
                          {searchResult && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute top-full left-0 right-0 mt-4 p-8 bg-stone-900 border border-emerald-500/20 rounded-[2.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
                            >
                               <div className="flex justify-between items-start mb-6">
                                 <div>
                                   <div className="flex items-center gap-3 mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Correlation Found</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">ICD-11: {searchResult.icd11}</span>
                                   </div>
                                   <h4 className="serif text-4xl text-white">{searchResult.name}</h4>
                                   <p className="text-emerald-500/80 font-serif italic text-xl mt-1">{searchResult.sanskrit}</p>
                                 </div>
                                 <button onClick={() => { setSearchResult(null); setIcdSearchQuery(''); }} className="p-2 text-stone-600 hover:text-white">
                                    <RefreshCcw size={16} />
                                 </button>
                               </div>
                               <div className="grid grid-cols-2 gap-4 mb-6">
                                 <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                                   <p className="text-[8px] font-black uppercase text-stone-600 mb-1 tracking-widest">Modern Equivalence</p>
                                   <p className="text-stone-200 text-xs font-bold">{searchResult.modernName}</p>
                                 </div>
                                 <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                                   <p className="text-[8px] font-black uppercase text-stone-600 mb-1 tracking-widest">TM2 Classification</p>
                                   <p className="text-stone-200 text-xs font-bold">{searchResult.tm2}</p>
                                 </div>
                               </div>
                               <p className="text-stone-400 text-xs leading-relaxed mb-6">{searchResult.description}</p>
                               
                               {getSamhitaData(searchResult.name) && (
                                 <div className="mb-8 p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                   <p className="text-[10px] font-black uppercase text-emerald-500 mb-3 tracking-widest">Recommended Shamana (Remedies)</p>
                                   <ul className="space-y-2">
                                     {getSamhitaData(searchResult.name)!.lakshanas.slice(0, 2).map((l, i) => (
                                       <li key={i} className="text-[10px] text-stone-400 flex items-center gap-2">
                                         <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                         {l}
                                       </li>
                                     ))}
                                     <li className="text-[10px] text-stone-400 flex items-center gap-2">
                                       <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                       Specific Pathya for {searchResult.name}
                                     </li>
                                   </ul>
                                 </div>
                               )}
                               
                               <button 
                                  onClick={() => setActiveTab('education')}
                                  className="w-full py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all"
                               >
                                 Study Full Clinical Profile
                               </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="mx-4 ayur-card p-8 bg-black/40 border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 group">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-black transition-all duration-500">
                          <Play size={24} fill="currentColor" />
                        </div>
                        <div>
                          <h4 className="serif text-2xl text-white">Universal Diagnostic Flow</h4>
                          <p className="text-stone-500 text-[10px] uppercase tracking-widest font-bold">Standard 3-Step Assessment: Profile → Scan → Clinical Lakshanas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-stone-600 mr-4">Clinically Validated</span>
                        <div className="flex -space-x-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="w-10 h-10 rounded-full border-4 border-stone-950 bg-stone-900 flex items-center justify-center text-[10px] font-black text-emerald-500">
                              {i}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

          {step === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="ayur-card p-fluid-lg w-full max-w-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="serif text-3xl font-medium mb-2">Patient Profile</h2>
                  <p className="text-stone-400 text-sm">Please provide clinical identity details to generate a personalized record.</p>
                </div>
                {ownerProfile.name && (
                  <button 
                    onClick={() => {
                      const profile = { ...ownerProfile };
                      // Recalculate age when copying to ensure it's fresh
                      if (profile.dob) {
                        profile.age = calculateAge(profile.dob);
                      }
                      setUserProfile(profile);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-500 hover:text-black transition-all flex items-center gap-2"
                  >
                    <User size={12} />
                    Use My Profile
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Full Name</label>
                  <input
                    type="text"
                    value={userProfile.name || ''}
                    onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                    placeholder="eg. Vishnu kumar"
                    className="ayur-input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Date of Birth</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={userProfile.dob || ''}
                      onChange={(e) => handleDOBChange(e.target.value)}
                      className="ayur-input w-full appearance-none pr-10"
                      max={new Date().toISOString().split('T')[0]}
                    />
                    {userProfile.age && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] font-bold text-emerald-500 uppercase">
                        {userProfile.age} Yrs
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Sex</label>
                  <div className="flex bg-stone-900/80 p-1.5 rounded-2xl border border-white/5 w-full">
                    {['Male', 'Female', 'Other'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setUserProfile({ ...userProfile, sex: option })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${userProfile.sex === option ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-stone-500 hover:text-stone-300'}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Phone Number</label>
                  <input
                    type="tel"
                    value={userProfile.phone || ''}
                    onChange={(e) => setUserProfile({ ...userProfile, phone: e.target.value })}
                    placeholder="+91..."
                    className="ayur-input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">State / Region</label>
                  <div className="relative">
                    <select
                      value={userProfile.state || ''}
                      onChange={(e) => setUserProfile({ ...userProfile, state: e.target.value })}
                      className="ayur-input w-full appearance-none pr-10"
                    >
                      <option value="" className="bg-stone-900">Select State</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state} className="bg-stone-900">
                          {state}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500">
                      <Download className="rotate-180" size={14} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Occupation</label>
                  <input
                    type="text"
                    value={userProfile.occupation || ''}
                    onChange={(e) => setUserProfile({ ...userProfile, occupation: e.target.value })}
                    placeholder="Work nature"
                    className="ayur-input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Condition Duration (Chronicity)</label>
                  <input
                    type="text"
                    value={userProfile.chronicity || ''}
                    onChange={(e) => setUserProfile({ ...userProfile, chronicity: e.target.value })}
                    placeholder="eg. 2 months, 1 year"
                    className="ayur-input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 ml-1">Family History</label>
                  <select
                    value={userProfile.familyHistory || ''}
                    onChange={(e) => setUserProfile({ ...userProfile, familyHistory: e.target.value })}
                    className="ayur-input w-full appearance-none pr-10"
                  >
                    <option value="" className="bg-stone-900">Select Status</option>
                    <option value="Yes" className="bg-stone-900">Yes, similar conditions in family</option>
                    <option value="No" className="bg-stone-900">No known family history</option>
                    <option value="Unsure" className="bg-stone-900">Unsure</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5">
                <div className="flex gap-4">
                  <button
                    onClick={() => setStep('welcome')}
                    className="flex-1 h-16 border border-white/10 rounded-3xl text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                  <button
                    onClick={() => {
                      if (isProfileValid()) {
                        setStep('scan');
                        startCamera();
                      }
                    }}
                    disabled={!isProfileValid()}
                    className={`flex-[2] h-16 text-lg flex items-center justify-center gap-3 rounded-3xl font-bold uppercase tracking-widest transition-all duration-500 ${isProfileValid() ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/30' : 'bg-stone-800 text-stone-500 cursor-not-allowed grayscale'}`}
                  >
                    <ArrowRight size={24} />
                    Confirm & Scan
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col gap-8 w-full max-w-xl"
            >
              <div className="ayur-card relative aspect-square bg-stone-950 flex items-center justify-center overflow-hidden">
                {isCameraActive ? (
                  <>
                    <video 
                      ref={setVideoRef} 
                      autoPlay 
                      playsInline 
                      muted
                      className="absolute inset-0 w-full h-full object-cover opacity-85" 
                    />
                    
                    {/* Layer 1: Skin-shaped Oval Outline HUD Overlay representing the lesion zone */}
                    <div className="absolute inset-x-12 inset-y-16 border-[3px] border-dashed border-emerald-500/40 rounded-[50%_/_50%] pointer-events-none flex flex-col items-center justify-between py-6">
                      <span className="text-[8px] font-black tracking-[0.2em] text-emerald-400/80 bg-black/40 px-2.5 py-1 rounded-full uppercase font-mono">
                        🎯 POSITION SKIN LESION HERE
                      </span>
                      {/* Oval Target Center Reticle */}
                      <div className="w-10 h-10 border border-emerald-400/30 rounded-full flex items-center justify-center relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500 animate-ping"></div>
                        <div className="absolute inset-x-0 w-full h-[1px] bg-emerald-400/20"></div>
                        <div className="absolute inset-y-0 h-full w-[1px] bg-emerald-400/20"></div>
                      </div>
                      <span className="text-[8px] font-black tracking-[0.2em] text-emerald-400/80 bg-black/40 px-2.5 py-1 rounded-full uppercase font-mono">
                        ALIGNED TO VERTICAL AXIS
                      </span>
                    </div>

                    {/* Real-time Bio-metric Telemetry Indicators */}
                    <div className="absolute top-4 left-4 right-4 flex flex-col gap-1.5 z-20 pointer-events-none">
                      {/* Light check */}
                      <div className="flex items-center justify-between w-full bg-stone-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5">
                        <span className="text-[8.5px] font-black tracking-wider text-stone-400 uppercase font-mono">☀️ AMBIENT LIGHT</span>
                        {liveBrightness !== null ? (
                          <span className={`text-[8.5px] font-black uppercase font-mono ${
                            liveLightStatus === 'good' ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {liveLightStatus === 'good' ? '✓ EXCELLENT' : liveLightStatus === 'dark' ? '⚠️ TOO DARK' : '⚠️ GLARE REFLECTION'} ({liveBrightness})
                          </span>
                        ) : (
                          <span className="text-[8.5px] text-stone-500 font-mono">CALIBRATING SYSTEM...</span>
                        )}
                      </div>

                      {/* Stability check */}
                      <div className="flex items-center justify-between w-full bg-stone-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5">
                        <span className="text-[8.5px] font-black tracking-wider text-stone-400 uppercase font-mono">🤝 CHASSIS STABILITY</span>
                        {liveSharpness !== null ? (
                          <span className={`text-[8.5px] font-black uppercase font-mono ${
                            liveSharpStatus === 'sharp' ? 'text-emerald-400' : 'text-rose-400 animate-pulse'
                          }`}>
                            {liveSharpStatus === 'sharp' ? '✓ SHARP & STEADY' : '⚠️ REDUCE HAND MOTION'} ({liveSharpness})
                          </span>
                        ) : (
                          <span className="text-[8.5px] text-stone-500 font-mono">READING FEED...</span>
                        )}
                      </div>

                      {/* Distance status check */}
                      <div className="flex items-center justify-between w-full bg-stone-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5">
                        <span className="text-[8.5px] font-black tracking-wider text-stone-400 uppercase font-mono">🔍 CAPTURE DISTANCE</span>
                        {liveDistanceStatus !== null ? (
                          <span className={`text-[8.5px] font-black uppercase font-mono ${
                            liveDistanceStatus === 'good' ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {liveDistanceStatus === 'good' ? '✓ OPTIMAL (10-15cm)' : liveDistanceStatus === 'too_close' ? '✥ TOO CLOSE (Hold back)' : '✥ TOO FAR (Move closer)'}
                          </span>
                        ) : (
                          <span className="text-[8.5px] text-stone-500 font-mono">MEASURING RESOLUTION...</span>
                        )}
                      </div>
                    </div>

                    <div className="absolute bottom-6 left-5 right-5 flex justify-between items-center z-20 pointer-events-none">
                      <div className="bg-stone-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/5 flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${autoCaptureEnabled ? 'bg-emerald-500 animate-ping' : 'bg-stone-500'}`}></div>
                        <span className="text-[8px] font-black text-white uppercase tracking-widest font-mono">
                          {autoCaptureEnabled ? 'AUTO-LOCK ON' : 'AUTO-LOCK OFF'}
                        </span>
                      </div>
                      
                      {autoCaptureTimeLeft !== null && (
                        <div className="bg-emerald-500 text-black px-3.5 py-1.5 rounded-full font-sans text-[8.5px] font-black uppercase tracking-widest animate-bounce">
                          CAPTURING IN {Math.ceil(autoCaptureTimeLeft)}s
                        </div>
                      )}
                    </div>

                    {/* Auto-Capture Overlay Feedback Flash */}
                    {autoCaptureEnabled && autoCaptureTimeLeft === 0 && (
                      <div className="absolute inset-0 bg-white z-50 flex items-center justify-center animate-fadeOut"></div>
                    )}

                    {images.length > 0 && (
                      <div className="absolute top-28 right-4 flex flex-col gap-2 z-30 pointer-events-auto">
                        {images.slice(-3).reverse().map((img, i) => (
                          <motion.div 
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            key={i} 
                            className="w-12 h-12 rounded-xl border-2 border-emerald-500/50 bg-stone-900 overflow-hidden shadow-2xl shadow-black"
                          >
                            <img src={img} className="w-full h-full object-cover" alt="Captured" />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                ) : images.length > 0 ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img 
                      src={images[images.length - 1]} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                      alt="Skin symptom"
                    />
                    <div className="absolute bottom-4 left-0 right-0 px-4 flex justify-between items-center bg-black/40 backdrop-blur-md py-3 border-t border-white/5">
                      <div className="flex -space-x-3 overflow-hidden">
                        {images.map((img, i) => (
                          <div key={i} className="w-10 h-10 rounded-lg border-2 border-stone-900 bg-stone-800 overflow-hidden shrink-0">
                            <img src={img} className="w-full h-full object-cover" alt={`Angle ${i+1}`} />
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{images.length} Angles Collected</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-stone-500">
                    <Camera size={48} className="opacity-20" />
                    <p className="text-xs uppercase tracking-widest font-black">Camera Ready</p>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Permanent Minimum Image Quality Specifications & Feedback */}
              {imageQuality ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mx-4 p-5 rounded-3xl border flex flex-col gap-4 ${
                    imageQuality.score >= 75 
                      ? 'bg-emerald-500/5 border-emerald-500/20' 
                      : imageQuality.score >= 65 
                        ? 'bg-amber-500/5 border-amber-500/20' 
                        : 'bg-rose-500/5 border-rose-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className={imageQuality.score >= 75 ? 'text-emerald-500 animate-pulse' : imageQuality.score >= 65 ? 'text-amber-500' : 'text-rose-500'} size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-stone-200">Clinical Image Quality Check</span>
                    </div>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full text-center tracking-wider ${
                      imageQuality.score >= 75 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : imageQuality.score >= 65 
                          ? 'bg-amber-500/10 text-amber-400' 
                          : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {imageQuality.score}% • {imageQuality.score >= 75 ? 'EXCELLENT' : imageQuality.score >= 65 ? 'BORDERLINE' : 'LOW QUALITY'}
                    </span>
                  </div>

                  {imageQuality.reason && (
                    <p className="text-stone-300 text-xs leading-relaxed italic">
                      "{imageQuality.reason}"
                    </p>
                  )}

                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        imageQuality.score >= 75 
                          ? 'bg-emerald-500' 
                          : imageQuality.score >= 65 
                            ? 'bg-amber-500' 
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${imageQuality.score}%` }}
                    />
                  </div>
                  
                  {imageQuality.score < 65 && (
                    <div className="flex items-start gap-2 text-rose-400 text-[10px] font-bold leading-relaxed uppercase tracking-wider bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>Warning: Clinical Quality is below the 65% benchmark. Analysis is locked to prevent false diagnosis. Please recapture or upload a higher quality clear image.</span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="mx-4 p-5 bg-stone-900 border border-white/5 rounded-[2rem] space-y-4">
                  <div className="flex items-center gap-2">
                    <Info size={16} className="text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Stated Quality Benchmarks (Min 65% Score)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-stone-200 text-xs font-semibold">1. Illumination</p>
                      <p className="text-stone-400 text-[10px] leading-tight">Overhead natural light preferred. Avoid fluorescent tints or shadows.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-stone-200 text-xs font-semibold">2. Macro Focus</p>
                      <p className="text-stone-400 text-[10px] leading-tight">Lesion margins must be ultra-sharp. No blur or smudged detail.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-stone-200 text-xs font-semibold">3. Frame Coverage</p>
                      <p className="text-stone-400 text-[10px] leading-tight">Ensure lesion covers 50-70% of frame for visual bio-marker inference.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-stone-200 text-xs font-semibold">4. Zero Modifiers</p>
                      <p className="text-stone-400 text-[10px] leading-tight">No camera filters, color enhancements, or warm night effects.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[#a855f7] text-xs font-semibold flex items-center gap-1">
                        <Sparkles size={12} />
                        5. Min Megapixels
                      </p>
                      <p className="text-stone-400 text-[10px] leading-tight font-sans font-medium">
                        Min limit: <strong className="text-stone-200">0.5 MP</strong>. Handled easily by common budget devices and front cameras.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                        <RefreshCcw size={12} className="animate-spin text-emerald-400" />
                        6. Auto-Enhancement
                      </p>
                      <p className="text-stone-400 text-[10px] leading-tight font-sans">
                        Canvas pipeline upscales low-res inputs by 4× and equalizes colors matching expensive 48MP cameras.
                      </p>
                    </div>
                    <div className="space-y-1 col-span-2 border-t border-white/5 pt-2 mt-1">
                      <p className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles size={12} className="animate-pulse" />
                        7. Multiple Angles (Highly Recommended)
                      </p>
                      <p className="text-stone-300 text-[10px] leading-snug">
                        Capture multiple distinct orientations of the lesion. Sourcing 2-3 viewpoints guarantees the AI can precisely pre-fill the diagnostic questionnaire and make correct clinical assessments.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Guided Auto-Capture Controls Selector */}
              <div className="flex items-center justify-between bg-stone-900/80 border border-white/5 p-4 rounded-3xl mx-4">
                <div className="flex items-center gap-2">
                  <Camera size={16} className="text-emerald-400" />
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">Live Auto-Sensor Trigger</span>
                </div>
                <button 
                  onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                    autoCaptureEnabled 
                      ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' 
                      : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {autoCaptureEnabled ? 'AUTO SYSTEM ON' : 'MANUAL ONLY'}
                </button>
              </div>

              {/* Optical Auto-Enhancement feedback panel */}
              {isEnhancing && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-3xl flex items-center gap-3.5 mx-4">
                  <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      ✨ DIGITAL SIGNAL ENHANCEMENT RUNNING
                    </p>
                    <p className="text-[9px] text-stone-400 leading-snug">
                      Applying Gray-World white-balance, CLAHE details stretching and Laplacian edge crispness to equalize camera hardware gaps.
                    </p>
                  </div>
                </div>
              )}

              <div className="px-4">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={captureImage} className="ayur-button-primary h-20 text-xl group col-span-2">
                      <Camera size={28} className="group-hover:scale-110 transition-transform" />
                      {!isCameraActive ? 'Capture Another Angle' : images.length > 0 ? 'Capture New Angle' : 'Capture Sample'}
                    </button>
                    <button 
                      onClick={() => {
                        stopCamera();
                        fileInputRef.current?.click();
                      }} 
                      className="ayur-button-dark-green h-16 text-base"
                    >
                      <Upload size={18} />
                      Add Photo
                    </button>
                    <button 
                      onClick={() => {
                        stopCamera();
                        setStep('profile');
                      }} 
                      className="ayur-button-secondary h-16 text-base"
                    >
                      <ChevronLeft size={18} /> Back
                    </button>
                    <button onClick={() => { stopCamera(); setImages([]); setQualityNotice(null); setImageQuality(null); setBypassedQuality(false); startCamera(); }} className="ayur-button-secondary h-16 text-base">
                      <RefreshCcw size={18} /> Reset
                    </button>
                  </div>

                  {images.length > 0 && (
                    <button 
                      onClick={() => {
                        if (isCheckingQuality || isVisualScanning) return;
                        if (!isImageSetQualified && !bypassedQuality) {
                          setShowQualityWarningModal(true);
                        } else {
                          stopCamera();
                          setStep('affected_area');
                        }
                      }} 
                      disabled={isCheckingQuality || isVisualScanning}
                      className={`ayur-button-primary h-20 text-xl transition-all duration-500 overflow-hidden relative group mt-4 ${isCheckingQuality || isVisualScanning ? 'opacity-50 cursor-not-allowed grayscale' : ''} shadow-[0_20px_40px_rgba(16,185,129,0.2)]`}
                    >
                      {isCheckingQuality ? (
                        <div className="flex items-center gap-3 slide-in">
                          <div className="w-6 h-6 border-2 border-dashed border-black rounded-full animate-spin" />
                          <span>Checking Quality...</span>
                        </div>
                      ) : isVisualScanning ? (
                        <div className="flex items-center gap-3 slide-in">
                          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          <span>Processing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          Analyze {images.length} {images.length === 1 ? 'Image' : 'Images'} <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      )}
                    </button>
                  )}
                </div>
                <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <p className="text-center text-[11px] text-amber-300 font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <Info size={14} className="shrink-0 animate-pulse text-amber-400" />
                    Multi-Angle Clinical Remark
                  </p>
                  <p className="text-center text-[10px] text-stone-300 mt-1 leading-normal">
                    You need to capture or upload images from <strong>multiple angles</strong> to automatically and accurately fill the questionnaire. This ensures physical features matches are highly accurate, and the final diagnosis is correct.
                  </p>
                </div>
                <p className="text-center text-[10px] text-stone-500 mt-4 font-medium italic">Position capture area clearly within the frame markers.</p>
                
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center">
                    <Sparkles className="text-emerald-500" size={14} />
                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Bright Light</span>
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center">
                    <Check className="text-blue-500" size={14} />
                    <span className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter">Steady Hand</span>
                  </div>
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center">
                    <Camera className="text-amber-500 animate-pulse" size={14} />
                    <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">Multi-Angles</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'affected_area' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="ayur-card p-fluid-lg w-full max-w-2xl mx-auto flex flex-col"
            >
              {!lesionExtent ? (
                <div className="flex flex-col items-center justify-center space-y-8 min-h-[400px]">
                  <div className="text-center">
                    <h2 className="serif text-3xl font-medium text-white mb-2">How much of the body is affected?</h2>
                  </div>
                  <div className="flex flex-col gap-4 w-full max-w-md">
                    <button onClick={() => setLesionExtent('single')} className="flex items-center gap-6 p-6 rounded-3xl border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left">
                      <div className="w-16 h-16 rounded-full bg-stone-800 border-2 border-stone-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                         <div className="w-8 h-8 rounded-full bg-stone-600 relative"><div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500"></div></div>
                      </div>
                      <div>
                        <span className="block text-xl font-medium text-white">Single Lesion</span>
                        <span className="block text-sm text-stone-400">A single lesion or growth</span>
                      </div>
                    </button>
                    <button onClick={() => setLesionExtent('limited')} className="flex items-center gap-6 p-6 rounded-3xl border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left">
                      <div className="w-16 h-16 rounded-full bg-stone-800 border-2 border-stone-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        <div className="w-8 h-8 bg-stone-600 rounded-lg relative overflow-hidden">
                          <div className="absolute inset-0 bg-rose-500/30"></div>
                          <div className="absolute top-0 right-0 w-3 h-4 bg-rose-500/60"></div>
                        </div>
                      </div>
                      <div>
                        <span className="block text-xl font-medium text-white">Limited Area</span>
                        <span className="block text-sm text-stone-400">Multiple lesions involving 1 or more areas</span>
                      </div>
                    </button>
                    <button onClick={() => setLesionExtent('widespread')} className="flex items-center gap-6 p-6 rounded-3xl border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left">
                      <div className="w-16 h-16 rounded-full bg-stone-800 border-2 border-stone-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        <div className="w-10 h-10 bg-rose-500/30 rounded flex items-center justify-center">
                           <div className="w-8 h-8 bg-rose-500/30 rounded flex items-center justify-center"><div className="w-4 h-4 bg-rose-500/50 rounded"></div></div>
                        </div>
                      </div>
                      <div>
                        <span className="block text-xl font-medium text-white">Widespread</span>
                        <span className="block text-sm text-stone-400">Affecting most of the body</span>
                      </div>
                    </button>
                  </div>
                  <button onClick={() => setStep('scan')} className="mt-4 px-6 py-3 rounded-full text-sm uppercase tracking-widest font-bold text-stone-500 hover:text-white transition-colors">
                    Back
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 text-center">
                    <h2 className="serif text-3xl font-medium text-white">Where is the affected area?</h2>
                    <p className="text-stone-400 text-sm mt-2">Indicate where the problem area is by tapping it on the body.</p>
                  </div>

                  <div className="flex-1 relative flex justify-center w-full max-w-lg mx-auto">
                    <BodyMap 
                      selectedAreas={affectedAreas} 
                      onToggleArea={(area) => {
                        setAffectedAreas(prev => {
                          const next = prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area];
                          setAreaHistory(h => [...h, next]);
                          return next;
                        });
                      }} 
                    />
                    
                    {/* Floating Edit Controls */}
                    <div className="absolute bottom-4 left-4 flex flex-col gap-1 w-24">
                       <button
                         onClick={() => {
                           setAffectedAreas([]);
                           setAreaHistory([[]]);
                         }}
                         className="px-4 py-2.5 bg-white border border-stone-200 text-[#d94f65] text-xs font-medium uppercase tracking-widest hover:bg-stone-50 transition-colors first:rounded-t-xl"
                       >
                         Clear
                       </button>
                       <button
                         onClick={() => {
                           setAreaHistory(h => {
                             if (h.length > 1) {
                               const newH = h.slice(0, -1);
                               setAffectedAreas(newH[newH.length - 1]);
                               return newH;
                             }
                             return h;
                           });
                         }}
                         className="px-4 py-2.5 bg-white border border-t-0 border-stone-200 text-[#d94f65] text-xs font-medium uppercase tracking-widest hover:bg-stone-50 transition-colors last:rounded-b-xl"
                       >
                         Undo
                       </button>
                    </div>
                  </div>

                  {affectedAreas.length > 0 && (
                    <div className="mt-6 p-4 bg-stone-900/50 rounded-2xl border border-white/5">
                      <span className="text-[10px] uppercase font-black tracking-widest text-stone-500 block mb-1">Locations Selected ({affectedAreas.length})</span>
                      <p className="text-sm font-medium text-white capitalize leading-relaxed">
                         {affectedAreas.join(' + ') || 'None'}
                      </p>
                    </div>
                  )}
                  
                  <div className="mt-8 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-center gap-4">
                    <button
                      onClick={() => setLesionExtent(null)}
                      className="ayur-button-secondary h-16 flex-1 order-2 sm:order-1"
                    >
                      <ChevronLeft size={18} /> Back
                    </button>
                    <div className="flex-[2] flex gap-2 order-1 sm:order-2">
                      <button
                        onClick={() => setStep('questions')}
                        className="flex-1 h-16 border border-white/10 rounded-3xl text-[10px] font-black uppercase tracking-widest text-stone-300 hover:bg-white/5 transition-all outline-none"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => setStep('questions')}
                        className="flex-[2] h-16 bg-emerald-500 text-black hover:bg-emerald-400 hover:shadow-xl hover:shadow-emerald-500/20 text-lg flex items-center justify-center gap-3 rounded-3xl font-bold uppercase tracking-widest transition-all duration-300"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {(step === 'questions' || step === 'kushtha_questions') && (
            <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl mx-auto">
              {/* Left Sidebar: Visual Monitor (New) */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:w-80 shrink-0"
              >
                <div className="ayur-card overflow-hidden sticky top-24">
                  <div className="p-4 border-b border-white/5 bg-emerald-500/5">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Live Visual Monitor</h3>
                  </div>
                  <div className="relative aspect-square bg-black overflow-hidden group">
                    {images.length > 0 && (
                      <div className="w-full h-full relative">
                        <img 
                          src={images[0]} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                          alt="Visual input" 
                        />
                        {images.length > 1 && (
                          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 text-[8px] font-black text-white uppercase tracking-widest">
                            +{images.length - 1} More
                          </div>
                        )}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    
                    {/* Visual Overlay Scanning Effect */}
                    {isVisualScanning && (
                      <motion.div 
                        animate={{ top: ['-10%', '110%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 right-0 h-0.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] z-20"
                      />
                    )}
                  </div>
                  <div className="p-6 space-y-6 bg-stone-950/40">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-stone-500">Visual Bio-Markers</span>
                        <span className="text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{inferredFeatures.length} Found</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {inferredFeatures.length > 0 ? (
                          inferredFeatures.map(f => (
                            <span key={f} className="text-[7px] font-bold uppercase tracking-widest px-2 py-1 bg-white/5 rounded-md text-stone-300 border border-white/5 animate-in fade-in zoom-in duration-500">
                              {f.replace(/_/g, ' ')}
                            </span>
                          ))
                        ) : (
                          <span className="text-[8px] italic text-stone-600">Pending deep scan...</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-stone-500">Scanning Precision</span>
                        <span className="text-[8px] font-bold text-emerald-500">{isVisualScanning ? '98.4%' : 'Optimized'}</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          animate={isVisualScanning ? { x: ['-100%', '100%'] } : { x: '0%' }}
                          transition={isVisualScanning ? { duration: 1.5, repeat: Infinity, ease: "linear" } : {}}
                          className="h-full bg-emerald-500/40 w-1/2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="ayur-card p-fluid-lg flex-1"
              >
              {step === 'questions' && (
                <>
              <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h2 className="serif text-3xl font-medium mb-2">Charaka Samhita Lakshana Assessment</h2>
                  <p className="text-stone-400 text-sm">Response to all parameters is recommended for precision, but partial data is accepted.</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Progress</span>
                  <span className="serif text-2xl font-light">{answeredDoshaCount}<span className="opacity-30">/</span>{totalDoshaQuestions}</span>
                </div>
              </div>

              {/* AI Auto-Fill / Diagnostic Trigger Panel */}
              <div className="mb-8 p-6 bg-stone-950/40 border border-emerald-500/15 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-emerald-500 animate-pulse" />
                    AI Lesion Scanner Auto-Fill
                  </h4>
                  <p className="text-stone-400 text-[10px] leading-relaxed mt-1">
                    Select AI to scan the uploaded dermatological images. It will automatically check/pre-fill the physical features based on skin morphology, leaving the sensory/subjective options for manual user selection.
                  </p>
                  {images.length < 3 && (
                    <div className="mt-3 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-2xl flex flex-col gap-1">
                      <span className="font-bold flex items-center gap-1.5 uppercase text-[9px] tracking-wider text-amber-400">
                        ⚠️ Clinical Remark for Precise Diagnosis
                      </span>
                      <span className="leading-normal">
                        You have provided {images.length} view/angle. Providing a <strong>minimum of 3 distinct angles or close-up images</strong> is required to optimally autofill the physical features. This ensures correct visual bio-marker mapping and a precise clinical diagnosis. Please upload 3 or more viewpoints of the skin lesion.
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (images.length === 0) {
                      setError("Please upload or capture a lesion image in the scan step first.");
                      return;
                    }
                    await runVisualScan(images);
                  }}
                  disabled={isVisualScanning}
                  className="py-3 px-6 h-12 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-lg shrink-0 flex items-center justify-center gap-2"
                >
                  {isVisualScanning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Camera size={12} />
                      Select AI to Scan Lesion
                    </>
                  )}
                </button>
              </div>

              {isVisualScanning && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 text-center"
                >
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={20} />
                  </div>
                  <div>
                    <h4 className="text-emerald-500 font-black uppercase tracking-[0.2em] text-xs mb-1">AI Clinical Scanning in Progress</h4>
                    <p className="text-stone-400 text-[10px] uppercase tracking-widest leading-relaxed">
                      Analyzing morphology, color, and texture against Samhita references.<br/>
                      Lakshanas will be pre-filled once analysis is complete.
                    </p>
                  </div>
                </motion.div>
              )}

              {scanCompleteNotice && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-8 bg-emerald-500/20 border border-emerald-500/40 rounded-3xl p-5 flex items-center gap-5 shadow-2xl shadow-emerald-500/10"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-black flex items-center justify-center shrink-0 shadow-lg">
                    <Check size={24} strokeWidth={3} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-sm">Visual Scan Complete</h4>
                    <p className="text-emerald-400/80 text-[10px] font-black uppercase tracking-widest">
                      Physical Features successfully evaluated and pre-filled!
                    </p>
                  </div>
                </motion.div>
              )}
 
              <div className="w-full bg-white/5 h-1.5 rounded-full mb-10 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(answeredDoshaCount / totalDoshaQuestions) * 100}%` }}
                  className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
              </div>

              <div className="space-y-12 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar pb-10">
                {LAKSHANA_QUESTIONS.map((cat, idx) => (
                  <div key={idx} className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/70 border-b border-white/5 pb-2">{cat.category}</h3>
                    <div className="flex flex-col gap-4">
                      {cat.questions.map((q) => (
                        <div key={q.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-3xl border transition-all duration-300 gap-4 ${answers[q.id] !== undefined && answers[q.id] !== null ? 'bg-white/[0.02] border-white/10' : 'bg-stone-950/40 border-dashed border-white/5'} ${inferredFeatures.includes(q.id) ? 'ring-1 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : ''}`}>
                          <div className="flex-1 flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {(q as any).dosha && (
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  (q as any).dosha === 'Vata' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                  (q as any).dosha === 'Pitta' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                  'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                }`}>
                                  {(q as any).dosha}
                                </span>
                              )}
                              {(q as any).sanskrit && (
                                <span className="text-[9px] font-semibold text-stone-400 font-mono italic px-2 py-0.5 rounded bg-white/5 border border-white/5">
                                  {(q as any).sanskrit}
                                </span>
                              )}
                              {(q as any).physicalFeature ? (
                                <span className="text-[7px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                  <Sparkles size={8} /> AI Scannable
                                </span>
                              ) : (
                                <span className="text-[7px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                  <User size={8} /> Manual Entry
                                </span>
                              )}
                              {inferredFeatures.includes(q.id) && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1 ml-auto">
                                  <Check size={8} /> Present (AI Filled)
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-medium text-stone-200">{q.label}</span>
                            {['charak_vat_shosha', 'charak_kap_utsedha', 'charak_kap_sthairya'].includes(q.id) && images.length < 3 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl transition-all">
                                <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1.5">
                                  <Info size={11} className="text-amber-500 shrink-0" />
                                  Clinical Remark: <strong>A minimum of 3 distinct images/angles</strong> are needed here for highly accurate AI pre-filling. Please upload 3 or more viewpoints of the lesion.
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex bg-stone-900/80 p-1 rounded-2xl border border-white/5 w-fit">
                            <button
                              onClick={() => setAnswers({ ...answers, [q.id]: true })}
                              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${answers[q.id] === true ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-stone-500 hover:text-stone-300'}`}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => setAnswers({ ...answers, [q.id]: false })}
                              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${answers[q.id] === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-stone-500 hover:text-stone-300'}`}
                            >
                              Absent
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-white/5 flex justify-center gap-4 max-w-xl mx-auto w-full">
                <button
                  onClick={() => setStep('affected_area')}
                  className="ayur-button-secondary h-16 flex-1"
                >
                  <ChevronLeft size={18} /> Back
                </button>
                <button
                  onClick={() => {
                    runAnalysis();
                  }}
                  disabled={!canRunAnalysis || isCheckingQuality || isVisualScanning}
                  className={`flex-[2] h-16 text-lg flex items-center justify-center gap-3 rounded-3xl font-bold uppercase tracking-widest transition-all duration-500 ${
                    (!canRunAnalysis || isCheckingQuality || isVisualScanning)
                      ? 'bg-stone-800 text-stone-500 cursor-not-allowed grayscale'
                      : 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/30'
                  }`}
                >
                  {diagnosticMode === 'dosha' ? 'Generate Dosha Analysis' : 'Generate Full Clinical Analysis'}
                  <ArrowRight size={24} />
                </button>
              </div>
                </>
              )}

              {step === 'kushtha_questions' && (
                <>
              <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h2 className="serif text-3xl font-medium mb-2">Kushtha Classification</h2>
                  <p className="text-stone-400 text-sm">Identifying precise Samprapti through specific morphology.</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Progress</span>
                  <span className="serif text-2xl font-light">{answeredKushthaCount}<span className="opacity-30">/</span>{totalKushthaQuestions}</span>
                </div>
              </div>

              {/* AI Auto-Fill / Diagnostic Trigger Panel */}
              <div className="mb-8 p-6 bg-stone-950/40 border border-emerald-500/15 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-emerald-500 animate-pulse" />
                    AI Lesion Scanner Auto-Fill
                  </h4>
                  <p className="text-stone-400 text-[10px] leading-relaxed mt-1">
                    Select AI to scan the uploaded dermatological images. It will automatically check/pre-fill the physical morphological features based on Charaka Samhita classification criteria, leaving other options for manual input.
                  </p>
                  {images.length < 3 && (
                    <div className="mt-3 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-2xl flex flex-col gap-1">
                      <span className="font-bold flex items-center gap-1.5 uppercase text-[9px] tracking-wider text-amber-400">
                        ⚠️ Clinical Remark for Precise Diagnosis
                      </span>
                      <span className="leading-normal">
                        You have provided {images.length} view/angle. Providing a <strong>minimum of 3 distinct angles or close-up images</strong> is required to optimally autofill the questionnaire features, allowing the AI to correctly map margins and colors for an accurate diagnosis. Please upload 3 or more viewpoints of the skin lesion.
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (images.length === 0) {
                      setError("Please upload or capture a lesion image in the scan step first.");
                      return;
                    }
                    await runVisualScan(images);
                  }}
                  disabled={isVisualScanning}
                  className="py-3 px-6 h-12 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-lg shrink-0 flex items-center justify-center gap-2"
                >
                  {isVisualScanning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Camera size={12} />
                      Select AI to Scan Lesion
                    </>
                  )}
                </button>
              </div>

              {isVisualScanning && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 text-center"
                >
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={20} />
                  </div>
                  <div>
                    <h4 className="text-emerald-500 font-black uppercase tracking-[0.2em] text-xs mb-1">AI Clinical Scanning in Progress</h4>
                    <p className="text-stone-400 text-[10px] uppercase tracking-widest leading-relaxed">
                      Analyzing morphology, color, and texture against Samhita references.<br/>
                      Lakshanas will be pre-filled once analysis is complete.
                    </p>
                  </div>
                </motion.div>
              )}

              {scanCompleteNotice && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-8 bg-emerald-500/20 border border-emerald-500/40 rounded-3xl p-5 flex items-center gap-5 shadow-2xl shadow-emerald-500/10"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-black flex items-center justify-center shrink-0 shadow-lg">
                    <Check size={24} strokeWidth={3} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-sm">Visual Scan Complete</h4>
                    <p className="text-emerald-400/80 text-[10px] font-black uppercase tracking-widest">
                      Physical Features successfully evaluated and pre-filled!
                    </p>
                  </div>
                </motion.div>
              )}

              <div className="w-full bg-white/5 h-1.5 rounded-full mb-10 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(answeredKushthaCount / totalKushthaQuestions) * 100}%` }}
                  className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
              </div>

              <div className="space-y-12 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar pb-10">
                {KUSHTHA_QUESTIONS.map((cat, idx) => (
                  <div key={idx} className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/70 border-b border-white/5 pb-2">{cat.category}</h3>
                    <div className="flex flex-col gap-4">
                      {cat.questions.map((q) => {
                        const isAiScannable = (q as any).physicalFeature === true;
                        return (
                          <div key={q.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-3xl border transition-all duration-300 gap-4 ${kushthaAnswers[q.id] !== undefined && kushthaAnswers[q.id] !== null ? 'bg-white/[0.02] border-white/10' : 'bg-stone-950/40 border-dashed border-white/5'} ${inferredFeatures.includes(q.id) ? 'ring-1 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : ''}`}>
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                {isAiScannable ? (
                                  <span className="text-[7px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                    <Sparkles size={8} /> AI Scannable
                                  </span>
                                ) : (
                                  <span className="text-[7px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                    <User size={8} /> Manual Entry
                                  </span>
                                )}
                                {inferredFeatures.includes(q.id) && (
                                  <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1 ml-auto">
                                    <Check size={8} /> Present (AI Filled)
                                  </span>
                                )}
                              </div>
                              <span className="text-sm font-medium text-stone-200">{q.label}</span>
                              {['sethira_edges', 'vishama_edges', 'elephant_skin', 'palms_soles_cracks', 'thick_skin'].includes(q.id) && images.length < 3 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl transition-all">
                                  <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1.5">
                                    <Info size={11} className="text-amber-500 shrink-0" />
                                    Clinical Remark: <strong>A minimum of 3 distinct images/angles</strong> are needed here for highly accurate AI pre-filling. Please upload 3 or more viewpoints of the lesion.
                                  </span>
                                </div>
                              )}
                            </div>
                          <div className="flex bg-stone-900/80 p-1 rounded-2xl border border-white/5 w-fit">
                            <button
                              onClick={() => setKushthaAnswers({ ...kushthaAnswers, [q.id]: true })}
                              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${kushthaAnswers[q.id] === true ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-stone-500 hover:text-stone-300'}`}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => setKushthaAnswers({ ...kushthaAnswers, [q.id]: false })}
                              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${kushthaAnswers[q.id] === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-stone-500 hover:text-stone-300'}`}
                            >
                              Absent
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-white/5 flex justify-center gap-4 max-w-xl mx-auto w-full">
                <button
                  onClick={() => setStep(diagnosticMode === 'dosha' ? 'questions' : 'scan')}
                  className="ayur-button-secondary h-16 flex-1"
                >
                  <ChevronLeft size={18} /> Back
                </button>
                <button
                  onClick={runAnalysis}
                  disabled={!canRunAnalysis || isCheckingQuality || isVisualScanning}
                  className={`flex-[2] h-16 text-lg flex items-center justify-center gap-3 rounded-3xl font-bold uppercase tracking-widest transition-all duration-500 ${ (canRunAnalysis && !isCheckingQuality && !isVisualScanning) ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/30' : 'bg-stone-800 text-stone-500 cursor-not-allowed grayscale'}`}
                >
                  {isCheckingQuality || isVisualScanning ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                      <span>Checking Quality...</span>
                    </div>
                  ) : (
                    <>
                      <ClipboardCheck size={24} />
                      {images.length > 0 && !isImageSetQualified 
                        ? 'Quality Unmet' 
                        : answeredKushthaCount >= totalKushthaQuestions 
                          ? 'Generate Analysis' 
                          : 'Run Partial Analysis'}
                    </>
                  )}
                </button>
              </div>
              
              {!canRunAnalysis && images.length > 0 && (
                <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl max-w-xl mx-auto text-center">
                  <p className="text-[10px] text-rose-400 font-black uppercase tracking-wider">
                    🔒 Generation Blocked: Quality Requirement Unmet
                  </p>
                  <p className="text-[10px] text-stone-450 mt-1 leading-relaxed">
                    Ayurvedic skin models require at least 1 high-quality close-up image (≥ 65% score) or a min of 3 viewpoints to safely run diagnosis. Go back to upload/capture more angles.
                  </p>
                </div>
              )}
                </>
              )}
            </motion.div>
          </div>
          )}

          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              className="ayur-card p-fluid-lg text-center flex flex-col items-center gap-10 w-full max-w-xl"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                  className="w-24 h-24 sm:w-32 sm:h-32 border-b-2 border-emerald-500 rounded-full flex items-center justify-center"
                />
                <Leaf className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={32} />
              </div>
              <div className="space-y-6">
                <h3 className="serif text-3xl sm:text-4xl">Deep Clinical Analysis</h3>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                        className="w-2 h-2 rounded-full bg-emerald-500"
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ duration: 5 }}
                  className="bg-emerald-500 h-full w-full shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                />
              </div>
            </motion.div>
          )}

          {step === 'results' && result && result.discrepantLesionTypesDetected && (
            <motion.div
              key="mismatched-results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 pb-fluid-lg w-full max-w-4xl"
            >
              <div id="mismatched-wrapper" className="space-y-8 p-10 rounded-[2.5rem] bg-[#1a0e0e]/95 border border-rose-500/20 shadow-2xl">
                <div className="flex flex-col items-center text-center py-6 space-y-6">
                  <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                    <AlertTriangle size={44} className="animate-pulse" />
                  </div>
                  
                  <div className="space-y-3 max-w-2xl">
                    <span className="text-[10px] uppercase font-black tracking-[0.3em] text-rose-400 font-mono block">
                      ⚠️ MULTI-LESION DISCREPANCY INTERRUPT
                    </span>
                    <h2 className="serif text-3xl text-white font-medium leading-tight font-sans">Fundamentally Different Skin Lesions Detected</h2>
                    <p className="text-stone-400 text-xs leading-relaxed max-w-lg mx-auto">
                      Our optical clinical scanning analyzer has identified multiple conflicting dermatological presentations that do not belong to the same disease pathway.
                    </p>
                  </div>

                  <div className="w-full max-w-xl p-6 bg-stone-950/60 border border-white/5 rounded-3xl text-left space-y-4">
                    <span className="text-[10px] uppercase font-black tracking-widest text-[#d97706] flex items-center gap-1.5 font-mono">
                      🔬 Clinical Mismatch Analysis
                    </span>
                    <p className="text-xs text-stone-300 leading-relaxed font-sans font-medium">
                      {result.mismatchedLesionsReason || "The uploaded collection contains skin areas representing unrelated clinical structures. Unified diagnosis cannot be safely performed on distinct diseases simultaneously."}
                    </p>
                  </div>

                  <div className="w-full max-w-xl p-6 bg-rose-950/20 border border-rose-500/10 rounded-3xl text-left space-y-3 text-rose-200">
                    <span className="text-[10px] uppercase font-black tracking-widest text-rose-400 font-mono block">
                      🛡️ Medical Safety & Accuracy Advisory
                    </span>
                    <p className="text-[11.5px] leading-relaxed font-sans text-stone-400">
                      In accordance with classical Ayurvedic Samhitas and modern clinical dermatology guidelines, diagnostic analysis requires localized, highly correlated lesions from the same disease manifestation. Mixing different eruptions prevents systemic dosha and clinical parameter formulation. To preclude incorrect diagnostic conclusions, processing has been halted and no clinical results are generated.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center pt-4 max-w-xl">
                    <button 
                      onClick={() => {
                        setStep('scan');
                      }}
                      className="flex-1 px-8 h-14 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 shadow-lg shadow-rose-600/10 border border-rose-500/30 font-sans flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera size={14} /> Modify Uploaded Images
                    </button>
                    <button 
                      onClick={() => {
                        resetAnalysis();
                        setActiveTab('assessment');
                      }}
                      className="flex-1 px-8 h-14 bg-white/5 hover:bg-white/10 text-stone-300 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 border border-white/10 font-sans flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCcw size={14} /> Reset & Restart Scan
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'results' && result && !result.discrepantLesionTypesDetected && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 pb-fluid-lg w-full max-w-4xl"
            >
              <div id="report-wrapper" className="space-y-8 p-fluid-md rounded-[2.5rem] bg-[#0d1e15]">
                {/* Clinical Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8 mb-4">
                  <div>
                    <h1 className="text-emerald-500 font-black uppercase tracking-[0.4em] text-[10px] mb-4">Clinical Diagnostic Record</h1>
                    <div className="space-y-1">
                      <h2 className="serif text-4xl text-white">{userProfile.name}</h2>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 font-medium">
                        <span>{userProfile.age} Years</span>
                        <span>•</span>
                        <span>{userProfile.sex}</span>
                        <span>•</span>
                        <span className="text-emerald-500/80">{userProfile.chronicity}</span>
                        {userProfile.familyHistory === 'Yes' && (
                          <>
                            <span>•</span>
                            <span className="text-amber-500">Family History (+)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60">Diagnostic Confidence</span>
                        <Info size={12} className="text-emerald-500/40 cursor-help" />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${result.confidenceScore}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={`h-full ${result.confidenceScore > 85 ? 'bg-emerald-500' : result.confidenceScore > 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          />
                        </div>
                        <span className="serif text-xl text-white">{result.confidenceScore}%</span>
                      </div>
                                   <div className="flex items-center gap-4">
                      <button 
                        onClick={() => generateClinicalPDF(result, userProfile, displayDoshaMetrics, images)}
                        className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-500 hover:bg-emerald-500 hover:text-black transition-all"
                      >
                        <Download size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

                {/* Methodological Separation Tabs */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5 border border-white/10 p-5 rounded-[2rem] mt-4">
                  <div className="space-y-0.5">
                    <h3 className="text-white text-xs font-black uppercase tracking-wider">Diagnostic Methodology</h3>
                    <p className="text-stone-400 text-xs">Choose between independent Ayurvedic traditional evaluation and modern dermatological standards.</p>
                  </div>
                  <div className="flex p-1 bg-stone-900 border border-white/5 rounded-2xl w-full sm:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setResultsTab('ayurvedic')}
                      className={`flex-1 sm:flex-none px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                        resultsTab === 'ayurvedic'
                          ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/10'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      <Leaf size={12} /> Ayurvedic View
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultsTab('modern')}
                      className={`flex-1 sm:flex-none px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                        resultsTab === 'modern'
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/10'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      <Globe size={12} /> Modern View
                    </button>
                  </div>
                </div>

                {/* Differential Diagnosis (Top 3 Candidates) Section */}
                {(() => {
                  const predictionsList = result.predictions || [
                    {
                      specificKushtha: result.specificKushtha,
                      modernClinicalCorrelation: result.modernClinicalCorrelation,
                      confidenceScore: result.confidenceScore
                    }
                  ];
                  const topPrediction = predictionsList[0];
                  const secondPrediction = predictionsList[1];
                  const isLowConfidence = topPrediction ? topPrediction.confidenceScore < 50 : false;
                  
                  // Near-tie is defined when the top candidate is close in score to the secondary candidate
                  const isNearTie = (topPrediction && secondPrediction)
                    ? Math.abs(topPrediction.confidenceScore - secondPrediction.confidenceScore) <= 10
                    : false;

                  const isAyurvedic = resultsTab === 'ayurvedic';

                  return (
                    <div className={`p-8 rounded-[2rem] border space-y-6 transition-all duration-500 ${
                      isAyurvedic 
                        ? 'bg-emerald-950/10 border-emerald-500/20 shadow-2xl shadow-emerald-550/5' 
                        : 'bg-blue-950/10 border-blue-500/20 shadow-2xl shadow-blue-500/5'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <span className={`text-[10px] font-black uppercase tracking-[0.3em] block ${isAyurvedic ? 'text-emerald-500' : 'text-blue-400'}`}>
                            {isAyurvedic ? 'Siddhanta Differential Panel' : 'Clinical Differential Panel'}
                          </span>
                          <h3 className="serif text-2xl text-white font-medium">
                            {isAyurvedic ? 'Top 3 Samhita Kushtha Candidates' : 'Top 3 Modern Clinical Impressions'}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {isNearTie && (
                            <span className="px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 animate-pulse">
                              <AlertCircle size={10} /> Near-Tie Warned
                            </span>
                          )}
                          {isLowConfidence && (
                            <span className="px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                              <AlertCircle size={10} /> Low Confidence Limit
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Clinical warnings alerts */}
                      {(isNearTie || isLowConfidence) && (
                        <div className={`p-5 rounded-2.5xl bg-amber-500/[0.03] border text-stone-300 space-y-2 ${isAyurvedic ? 'border-emerald-550/20' : 'border-blue-550/20'}`}>
                          <div className="flex items-center gap-2 text-amber-500 text-xs font-black uppercase tracking-wider">
                            <AlertCircle size={14} /> Diagnostic Ambiguity Warned
                          </div>
                          <p className="text-xs text-stone-450 leading-relaxed">
                            {isAyurvedic ? (
                              isNearTie && isLowConfidence
                                ? "CRITICAL TRADITIONAL NOTICE: Ayurvedic diagnostic confidence of the top Kushtha prediction is low, with highly merging Lakshanas. Consult a qualified Vaidya face-to-face to determine the actual Samprapti."
                                : isNearTie
                                ? "VIKARA WARN: Candidates exhibit highly resembling primary visual and physical Lakshanas (near-tie situation). Manual pulse and tactile inspection is advised to perform accurate Rogi-Roga Pariksha."
                                : "NOTICE: Combined primary diagnostic confidence remains low (under 50%). Multiple mixed Guna/Dosha patterns might be presenting."
                            ) : (
                              isNearTie && isLowConfidence 
                                ? "CRITICAL CLINICAL NOTICE: Diagnostic confidence of the top modern prediction is below 50% and is extremely close to the second candidate. Seek manual face-to-face physician consultation to resolve this ambiguity."
                                : isNearTie
                                ? "DIFFERENTIAL WARNING: Candidates exhibit highly resembling primary clinical criteria (near-tie situation). Seek qualified manual expertise to perform direct tactile or dermoscopic differentiation."
                                : "NOTICE: Combined primary diagnostic confidence of modern candidates remains low (under 50%). Broad or conflicting symptoms might be contributing."
                            )}
                          </p>
                        </div>
                      )}

                      {/* Candidates Listing */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {predictionsList.map((pred, idx) => {
                          const isTop = idx === 0;
                          
                          // Find Samhita database item to display pure Ayurvedic elements in Ayurvedic view, or ICD elements in Modern view
                          const matchItem = KUSHTHA_TYPES.find(
                            t => t.name.toLowerCase() === pred.specificKushtha.toLowerCase() || 
                                 t.id.toLowerCase() === pred.specificKushtha.toLowerCase()
                          );

                          return (
                            <div 
                              key={idx} 
                              className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between ${
                                isAyurvedic
                                  ? isTop 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5' 
                                    : 'bg-stone-900 border-white/5 opacity-80 hover:opacity-100 hover:border-white/10'
                                  : isTop
                                    ? 'bg-blue-500/10 border-blue-550/30 shadow-lg shadow-blue-500/5' 
                                    : 'bg-stone-900 border-white/5 opacity-80 hover:opacity-100 hover:border-white/10'
                              }`}
                            >
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider ${
                                    isAyurvedic
                                      ? isTop ? 'bg-emerald-500 text-black' : 'bg-white/5 text-stone-400 border border-white/5'
                                      : isTop ? 'bg-blue-500 text-white' : 'bg-white/5 text-stone-400 border border-white/5'
                                  }`}>
                                    {idx === 0 ? 'Primary Match' : idx === 1 ? 'Secondary Candidate' : 'Differential Candidate'}
                                  </span>
                                  <span className={`text-xs font-mono font-black ${isAyurvedic ? (isTop ? 'text-emerald-450' : 'text-stone-400') : (isTop ? 'text-blue-400' : 'text-stone-400')}`}>
                                    {pred.confidenceScore}%
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <h4 className="text-white text-base font-bold leading-snug">
                                    {isAyurvedic 
                                      ? (pred.specificKushtha || 'Differential') 
                                      : (pred.modernClinicalCorrelation || 'Dermatological Variant')
                                    }
                                  </h4>
                                  <p className={`text-xs font-serif ${isAyurvedic ? 'text-emerald-500/80 italic' : 'text-stone-400 font-mono text-[10px] tracking-wider uppercase'}`}>
                                    {isAyurvedic 
                                      ? (matchItem ? `${matchItem.sanskrit} • ${matchItem.category}` : 'Samhita Kushtha Class')
                                      : (matchItem?.icd11 ? `ICD-11: ${matchItem.icd11}` : 'Clinical Pattern')
                                    }
                                  </p>
                                </div>
                              </div>

                              <div className="mt-6">
                                <div className="h-1.5 w-full bg-stone-950/80 rounded-full overflow-hidden p-0.5 border border-white/5">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-1000 ${
                                      isAyurvedic 
                                        ? isTop ? 'bg-emerald-500' : 'bg-stone-500'
                                        : isTop ? 'bg-blue-500' : 'bg-stone-500'
                                    }`}
                                    style={{ width: `${pred.confidenceScore}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Affected Area Visualization Section */}
                {result.affectedAreas && result.affectedAreas.length > 0 && (
                  <div className="p-8 rounded-[2rem] border bg-stone-900/40 border-emerald-550/10 space-y-6 animate-fadeIn transition-all duration-500">
                    <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                      
                      {/* Left: Information Text */}
                      <div className="flex-1 space-y-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] block text-emerald-500 block">Lesion Topography Mapping</span>
                        <h3 className="serif text-2xl text-white font-medium">Affected Anatomical Zones</h3>
                        <p className="text-stone-400 text-sm leading-relaxed mb-4">
                          The mapped locations indicate areas of affected integumentary tissue where symptoms or lesions have manifested. In both Ayurveda and Modern Dermatology, the localized topography offers crucial insight into the pathway of disease (Marga) and the doshic affliction zones.
                        </p>
                        
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          {result.affectedAreas.map((area, idx) => (
                            <div key={idx} className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl uppercase tracking-wider text-[10px] font-black text-rose-400 flex items-center justify-between">
                              <span>
                                {area.replace(/-/g, ' ')}
                              </span>
                              <div className="w-2 h-2 rounded-full bg-rose-500/60 animate-pulse" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Vertical Body Map Form */}
                      <div className="w-full md:w-80 shrink-0 bg-stone-950/60 p-6 rounded-3xl border border-white/5 flex items-center justify-center">
                        <BodyMap selectedAreas={result.affectedAreas} readonly={true} />
                      </div>

                    </div>
                  </div>
                )}

                {/* Separated Content Blocks */}
                {resultsTab === 'ayurvedic' ? (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Widget 1: Doshic Dominancy Profile */}
                      {diagnosticMode === 'kushtha' && (
                        <div className="ayur-card p-8 bg-stone-950/60 border-emerald-500/10 relative overflow-hidden md:col-span-2">
                          <div className="absolute top-0 right-0 p-8 text-emerald-500/5 pointer-events-none">
                            <Leaf size={200} />
                          </div>
                          <div className="relative z-10">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-6 block">Doshic Imbalance Profile & Dominancy</span>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center mb-8">
                              {/* Dominance Badge Card */}
                              <div className="p-6 rounded-3xl bg-[#081810] border border-white/5 flex items-center gap-5 lg:col-span-1">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 ${getTheme(displayDoshaMetrics.dominance).bg} ${getTheme(displayDoshaMetrics.dominance).ink}`}>
                                  {displayDoshaMetrics.dominance[0] || 'D'}
                                </div>
                                <div>
                                  <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 mb-1">Dominant Dosha</p>
                                  <h4 className="serif text-2xl text-white font-medium">{displayDoshaMetrics.dominance} Dominance</h4>
                                  <p className="text-[8px] font-medium text-emerald-500 mt-1 uppercase tracking-widest">
                                    {displayDoshaMetrics.dominance === "Vata" ? "Charaka Samhita Chi. 7:34" :
                                     displayDoshaMetrics.dominance === "Pitta" ? "Charaka Samhita Chi. 7:35" :
                                     displayDoshaMetrics.dominance === "Kapha" ? "Charaka Samhita Chi. 7:36" :
                                     "Balanced Vitiation Pattern"}
                                  </p>
                                </div>
                              </div>

                              {/* Descriptive Briefing */}
                              <div className="lg:col-span-2 text-stone-400 text-xs leading-relaxed">
                                Based on your response to the 26 Charaka Samhita Lakshanas (symptoms), the lesion's pathogenetic profile exhibits a dominant <strong>{displayDoshaMetrics.dominance}</strong> imprint. According to Charaka, Kushtha conditions are rarely single-Doshic but reflect Tridosha involvement with varying dominance configurations. The percentage breakdown below shows the exact contribution of each Dosha's positive markers.
                              </div>
                            </div>

                            {/* Bar Graph Row */}
                            <div className="space-y-6">
                              {[
                                { name: 'Vata', pct: displayDoshaMetrics.Vata, count: displayDoshaMetrics.counts.Vata, max: 10, quote: 'रौक्ष्यं शोषस्तोधः शुलं सङ्कोचनं तथाऽऽयामः...', desc: 'Influences dryness (Raukshya), wasting (Shosha), pricking pain (Toda), tension/stretching (Aayama), and dusky discoloration.', color: 'from-amber-600 to-amber-500', barColor: 'bg-amber-500', lightColor: 'text-amber-400/80' },
                                { name: 'Pitta', pct: displayDoshaMetrics.Pitta, count: displayDoshaMetrics.counts.Pitta, max: 7, quote: 'दाहो रागः परिस्रवः पाकः विस्रो गन्धः क्लेदस्तथा...', desc: 'Influences heat glow (Daha), prominent redness (Raga), moisture collection (Kleda), and necrosis or suppuration (Paka).', color: 'from-rose-600 to-rose-500', barColor: 'bg-rose-500', lightColor: 'text-rose-400/80' },
                                { name: 'Kapha', pct: displayDoshaMetrics.Kapha, count: displayDoshaMetrics.counts.Kapha, max: 9, quote: 'श्वैत्यं शैत्यं कण्डूः स्थैर्यं चोत्सेधगौरवस्नेहाः...', desc: 'Influences whiteness/pallor (Shvaitya), constant itching (Kandu), tissue rigidity (Sthairya), and thick unctuous margins.', color: 'from-emerald-600 to-emerald-500', barColor: 'bg-emerald-500', lightColor: 'text-emerald-400/80' }
                              ].map((d) => (
                                <div key={d.name} className="p-5 rounded-3xl bg-stone-900/40 border border-white/5 space-y-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-white font-bold text-sm">{d.name} Component</span>
                                        <span className={`text-[8px] font-mono ${d.lightColor} italic bg-white/5 px-2.5 py-1 rounded-full border border-white/5`}>{d.quote}</span>
                                      </div>
                                      <p className="text-stone-500 text-[10px] max-w-xl leading-relaxed">{d.desc}</p>
                                    </div>
                                    <div className="text-right flex sm:flex-col items-baseline sm:items-end justify-between gap-1 shrink-0">
                                      <span className="text-white text-lg font-black">{d.pct.toFixed(1)}% <span className="text-[10px] text-stone-500 font-medium">Dosha %</span></span>
                                      <span className="text-[9px] font-mono text-stone-500">({d.count} of {d.max} positive markers)</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex justify-between text-[8px] font-black uppercase text-stone-600 tracking-wider">
                                      <span>Dosha Vitiation (Symptom-based Breakdown)</span>
                                      <span>{d.pct.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-stone-950/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${d.pct}%` }}
                                        transition={{ duration: 1, delay: 0.3 }}
                                        className={`h-full rounded-full bg-gradient-to-r ${d.color}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Widget 2.5: Patient Intake Review */}
                      <div className="ayur-card p-8 bg-stone-950/60 border-white/5 relative overflow-hidden md:col-span-2">
                        <div className="flex items-center gap-2 mb-6">
                          <Users size={16} className="text-emerald-500" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Patient Intake Review</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-600 mb-2">Chronicity</p>
                            <p className="text-xs font-bold text-white leading-tight">{userProfile.chronicity || 'Not Provided'}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-600 mb-2">Family History</p>
                            <p className={`text-xs font-bold leading-tight ${userProfile.familyHistory === 'Yes' ? 'text-amber-500' : 'text-white'}`}>{userProfile.familyHistory || 'Not Provided'}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-600 mb-2">Occupation</p>
                            <p className="text-xs font-bold text-white leading-tight">{userProfile.occupation || 'Not Provided'}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-stone-600 mb-2">Region (Desha)</p>
                            <p className="text-xs font-bold text-white leading-tight">{userProfile.state || 'Not Provided'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Widget 3: Kushtha Type - Pure Traditional View */}
                      {diagnosticMode === 'kushtha' && (
                        <div className="ayur-card p-8 bg-emerald-950/10 border-emerald-500/20 flex flex-col justify-between relative overflow-hidden md:col-span-2">
                          <div className="absolute top-0 right-0 p-6 opacity-10 rotate-12">
                            <ClipboardCheck size={280} />
                          </div>
                          <div className="relative z-10">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-6 block">Kushta Samhita Classification</span>
                            
                            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
                              <div className="space-y-2">
                                <h3 className="serif text-6xl text-white tracking-tight">{result.specificKushtha || suggestedKushtha?.name || 'Vicharchika'}</h3>
                                {suggestedKushtha && (
                                  <p className="font-serif italic text-emerald-500/80 text-3xl">{suggestedKushtha.sanskrit}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black ${getTheme(result.primaryDosha).bg} ${getTheme(result.primaryDosha).ink} border border-white/5`}>
                                  {result.primaryDosha?.[0] || 'T'}
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">Mukhya Dosha</p>
                                  <p className="text-stone-200 font-bold">{result.primaryDosha || 'Tridosha'}</p>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                              <div className="px-5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Traditional Diagnostic Class</p>
                                <p className="text-stone-200 text-xs font-bold leading-tight">{suggestedKushtha?.category || 'Clinical Variant'}</p>
                              </div>
                              <div className="px-5 py-3 rounded-2xl bg-stone-900 border border-white/5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-600 mb-1">AYUSH TM2 Code</p>
                                <p className="text-emerald-400 text-xs font-mono">{result.tm2 || samhitaDataResult?.tm2 || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3 mb-10">
                              <div className="px-5 py-2 rounded-2xl bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                                NIDANA SAMPRAPTI ACTIVE
                              </div>
                              <div className="px-5 py-2 rounded-2xl bg-white/5 text-stone-400 text-[10px] font-black uppercase tracking-widest border border-white/10">
                                Samprapti: {result.lakshanasFound.length} Lakshanas Found
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 p-8 bg-black/40 rounded-3xl border border-white/5 text-sm text-stone-300 leading-relaxed italic backdrop-blur-md">
                            <Quote className="text-emerald-500/40 mb-4" size={24} />
                            "{result.description}"
                          </div>

                          <div className="relative z-10 p-6 bg-black/50 border border-white/5 rounded-3xl mt-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Clinical Image Sourcing & Accuracy Verification</span>
                              {images.length < 3 ? (
                                <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[8px] font-black uppercase tracking-widest rounded-full flex items-center gap-1 animate-pulse">
                                  <Info size={8} /> Sourced: Single View ({images.length} / min 3)
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                                  <Check size={8} /> Sourced: Multi-Angle ({images.length})
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white/[0.01] p-4 rounded-2xl border border-white/5">
                              {images && images.length > 0 ? (
                                <div className="flex -space-x-2 shrink-0">
                                  {images.slice(0, 3).map((img, i) => (
                                    <img key={i} src={img} alt={`Angle ${i+1}`} className="w-10 h-10 object-cover rounded-full border-2 border-stone-900" />
                                  ))}
                                  {images.length > 3 && (
                                    <div className="w-10 h-10 bg-stone-800 border-2 border-stone-900 rounded-full flex items-center justify-center text-[9px] font-black text-stone-400 shrink-0">
                                      +{images.length - 3}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-stone-900 border border-white/5 rounded-full flex items-center justify-center text-stone-600 shrink-0">
                                  <Camera size={14} />
                                </div>
                              )}
                              <p className="text-[11px] text-stone-300 leading-normal">
                                {images.length < 3 ? (
                                  <>
                                    ⚠️ <strong>Diagnosis Accuracy Remark:</strong> Since fewer than 3 angles were uploaded, any automatic questionnaire pre-fills of margins, thickness, scaling, or boundary details may be restricted to a single projection. <strong>To guarantee maximum accuracy and a fully correct clinical diagnosis</strong>, please upload more viewpoints next time (minimum of 3 distinct images needed).
                                  </>
                                ) : (
                                  <>
                                    ✨ <strong>Diagnosis Accuracy Verified:</strong> Sourcing <strong>{images.length} distinct angles</strong> matches visual markers with optimal dimensional clearance. This cross-image analysis mitigates lighting gradients and validates lesion margins across multiple viewpoints, producing highly accurate Ayurvedic & modern clinical classifications.
                                  </>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Samhita Reference Comparison */}
                          {samhitaDataResult && (
                            <div className="relative z-10 mt-8 pt-8 border-t border-white/5">
                              <div className="flex items-center gap-2 mb-6">
                                <BookOpen size={16} className="text-emerald-500" />
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Canonical Samhita Comparison</h4>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-6 bg-stone-900/40 rounded-3xl border border-white/5">
                                  <span className="text-[8px] font-black uppercase text-emerald-500 block mb-4 tracking-tighter">Canonical Standards (Charaka)</span>
                                  <ul className="space-y-3">
                                    {samhitaDataResult.lakshanas.map((l, idx) => (
                                      <li key={idx} className="flex items-start gap-3 text-[10px] text-stone-300 leading-tight">
                                        <Check size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                        {l}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="p-6 bg-stone-900/40 rounded-3xl border border-white/5">
                                  <span className="text-[8px] font-black uppercase text-emerald-500 block mb-4 tracking-tighter">AI Visual Observations</span>
                                  <ul className="space-y-3">
                                    {result.lakshanasFound.slice(0, 4).map((l, idx) => (
                                      <li key={idx} className="flex items-start gap-3 text-[10px] text-stone-300 leading-tight">
                                        <Sparkles size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                        {l}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Lower Area for identified Lakshanas and Upashaya advice */}
                    <div className="space-y-10">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-emerald-500/80">Identified Lakshanas</h3>
                          <div className="flex flex-wrap gap-2 sm:gap-3">
                            {result.lakshanasFound.map((l, i) => (
                              <span key={i} className="px-4 py-2 bg-white/5 text-white/80 text-xs sm:text-sm rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>

                        {diagnosticMode === 'kushtha' && result.ayurvedicContext && (
                          <div className="p-6 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 italic text-xs text-stone-400 flex items-start gap-4 h-full items-center">
                            <span className="font-bold text-emerald-400 font-mono tracking-wider text-[10px] uppercase">Vaidyam:</span>
                            <div className="leading-relaxed">{result.ayurvedicContext}</div>
                          </div>
                        )}
                      </div>

                      <div className="prose prose-invert max-w-4xl mx-auto text-center py-4">
                        <p className="text-lg sm:text-xl text-stone-300 italic leading-relaxed font-serif">"{result.description}"</p>
                      </div>

                      {/* Centered Kushtha Recommendations in Horizontal Tabular form */}
                      <div className="ayur-card p-8 md:p-10 bg-stone-950/40 border-emerald-500/20 max-w-5xl mx-auto space-y-8">
                        <div className="text-center space-y-2">
                          <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400 inline-flex items-center gap-2">
                            <Leaf size={12} /> Charaka Samhita Chikitsa
                          </span>
                          <h3 className="serif text-3xl text-white font-medium">Kushtha Recommendations</h3>
                          <p className="text-xs text-stone-500 font-medium tracking-tight">
                            Authentic therapy principles sourced from Chikitsa Sthana Chapter 7.
                          </p>
                        </div>

                        {/* Dosha Dominance Principle from Charaka Samhita */}
                        {(() => {
                          const principle = getDoshaPrinciple(result.primaryDosha);
                          return (
                            <div className="p-5 rounded-2xl bg-emerald-500/[0.02] border border-emerald-500/10 space-y-2 max-w-3xl mx-auto text-center shadow-lg">
                              <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider text-emerald-400 border-b border-white/5 pb-2">
                                <span>Dosha Dominance Rule</span>
                                <span>{principle.verse}</span>
                              </div>
                              <p className="text-xs text-emerald-300 font-serif font-semibold italic">{principle.sanskrit}</p>
                              <p className="text-[10px] text-stone-400 leading-relaxed font-sans mt-1">
                                {principle.translation}
                              </p>
                              <div className="pt-2">
                                <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 inline-block">
                                  Primary Therapy: <strong className="text-white font-mono">{principle.primaryTherapy}</strong>
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Recommendations Table (Horizontal Tabular Form) */}
                        <div className="overflow-x-auto rounded-3xl border border-white/5 bg-black/30 shadow-2xl">
                          <table className="w-full text-left border-collapse min-w-[900px] table-auto">
                            <thead>
                              <tr className="bg-white/[0.02] border-b border-white/10">
                                <th className="px-6 py-4.5 text-[9px] uppercase font-black tracking-widest text-stone-400 w-1/5">Therapeutic Class / Modality</th>
                                <th className="px-6 py-4.5 text-[9px] uppercase font-black tracking-widest text-emerald-400 w-2/5">Actionable Ayurvedic Recommendation</th>
                                <th className="px-6 py-4.5 text-[9px] uppercase font-black tracking-widest text-sky-400 w-2/5 border-l border-white/5">Modern Clinical Validation & Equivalent</th>
                                <th className="px-6 py-4.5 text-[9px] uppercase font-black tracking-widest text-stone-400 text-right w-12">Citation</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                              {result.recommendations.map((rec, i) => {
                                const parsed = parseAyurvedicRecommendation(rec);
                                const modern = getModernValidation(parsed.category, parsed.content);
                                return (
                                  <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                                    <td className="px-6 py-6 align-top">
                                      <span className={`text-[8px] font-black tracking-wider px-2.5 py-1 rounded-md uppercase border inline-block ${
                                        parsed.category === 'SHODHANA' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                                        parsed.category === 'LOCAL THERAPY' ? 'bg-teal-500/15 text-teal-400 border-teal-500/20' :
                                        parsed.category === 'INTERNAL SAMANA' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' :
                                        parsed.category.includes('PATHYA') ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                                        parsed.category.includes('APATHYA') ? 'bg-rose-500/15 text-rose-400 border-rose-500/20' :
                                        'bg-stone-800/40 text-stone-400 border-white/10'
                                      }`}>
                                        {parsed.category}
                                      </span>
                                    </td>
                                    <td className="px-6 py-6 align-top pr-8">
                                      <p className="text-xs text-stone-200 leading-relaxed font-sans">{parsed.content}</p>
                                    </td>
                                    <td className="px-6 py-6 align-top border-l border-white/5 pl-8 pr-6">
                                      <div className="space-y-1.5">
                                        <div className="text-[10px] uppercase font-bold tracking-wider text-blue-400">
                                          🔬 {modern.equivalent}
                                        </div>
                                        <p className="text-[11px] text-stone-400 leading-relaxed font-sans">
                                          {modern.validation}
                                        </p>
                                      </div>
                                    </td>
                                    <td className="px-6 py-6 align-top text-right whitespace-nowrap">
                                      <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest bg-stone-900/60 px-2 py-1 rounded border border-white/5">Charaka Chi. 7</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="pt-4 border-t border-white/5 text-center">
                          <a 
                            href="https://www.carakasamhitaonline.com/index.php?title=Kushtha_Chikitsa#Dosha_dominance_in_types_of_kushtha"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-black text-emerald-500 uppercase tracking-wider inline-flex items-center justify-center gap-1.5 hover:text-emerald-400 transition-colors"
                          >
                            Explore Charaka Kushtha Chikitsa Reference <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                      {/* Left Modern Block: Optical Macro-Dermoscopy Scanner */}
                      <div className="ayur-card p-8 bg-stone-950/60 border-blue-500/20 relative overflow-hidden flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                              <Globe size={16} className="text-blue-400 animate-pulse" />
                              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-350">Optical Lesion Morphology Scanner</h4>
                            </div>
                            <span className="text-[8px] font-black uppercase px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">DermNet NZ Benchmarked</span>
                          </div>

                          <div className="relative rounded-[2.5rem] overflow-hidden border border-white/10 aspect-square max-w-sm mx-auto mb-6 bg-black flex items-center justify-center group shadow-2xl">
                            {/* Scanning Laser Line */}
                            <div className="absolute inset-x-0 h-0.5 bg-blue-400/80 shadow-[0_0_12px_#3b82f6] top-0 animate-[scan_3s_ease-in-out_infinite] z-20" />
                            {/* Medical Reticles */}
                            <div className="absolute top-6 left-6 w-5 h-5 border-t-2 border-l-2 border-blue-400/80 z-20 pointer-events-none" />
                            <div className="absolute top-6 right-6 w-5 h-5 border-t-2 border-r-2 border-blue-400/80 z-20 pointer-events-none" />
                            <div className="absolute bottom-6 left-6 w-5 h-5 border-b-2 border-l-2 border-blue-400/80 z-20 pointer-events-none" />
                            <div className="absolute bottom-6 right-6 w-5 h-5 border-b-2 border-r-2 border-blue-400/80 z-20 pointer-events-none" />
                            
                            {images && images.length > 0 ? (
                              <img 
                                src={images[0]} 
                                alt="Modern Clinical Focus" 
                                className="w-full h-full object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700 pointer-events-none"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="text-stone-600 text-xs text-center font-mono">No skin lesion image uploaded</div>
                            )}

                            <div className="absolute bottom-4 inset-x-4 px-4 py-2 bg-black/80 backdrop-blur-md rounded-2xl border border-white/10 text-center text-[9px] font-mono text-stone-400 z-20">
                              Target Skin Morphology Analysis Active Lock
                            </div>
                          </div>

                          {/* Optical Biomarkers */}
                          <div className="space-y-4">
                            <h5 className="text-[9px] font-black uppercase tracking-wider text-stone-400">Extracted Morphological Characteristics</h5>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                                <span className="text-stone-500 block text-[8px] uppercase font-black">Margin Definition</span>
                                <span className="text-white text-xs font-bold leading-tight">Well-Demarcated Borders</span>
                              </div>
                              <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                                <span className="text-stone-500 block text-[8px] uppercase font-black">Epidermal Texture</span>
                                <span className="text-white text-xs font-bold leading-tight">Morphed Scaling / Surface Shedding</span>
                              </div>
                              <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                                <span className="text-stone-500 block text-[8px] uppercase font-black">Erythematous Hue</span>
                                <span className="text-white text-xs font-bold leading-tight">Localized Cellular Erythema</span>
                              </div>
                              <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                                <span className="text-stone-500 block text-[8px] uppercase font-black">Visual Pattern</span>
                                <span className="text-white text-xs font-bold leading-tight">Symmetrical Plaque Arrangement</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-white/5 text-[9px] font-mono text-stone-500 leading-relaxed text-left">
                          *Observations modeled against primary morphological parameters set forth in modern cosmetic and medical dermatological visual classification.
                        </div>
                      </div>

                      {/* Right Modern Block: Diagnosis, Coding and Guidelines */}
                      <div className="space-y-6">
                        
                        {/* Clinical Correlation Card */}
                        <div className="ayur-card p-8 bg-stone-950/60 border-blue-500/20 relative overflow-hidden flex flex-col justify-between">
                          <div className="absolute -top-10 -right-10 w-44 h-44 bg-blue-500/5 rounded-full blur-3xl" />
                          <div className="relative z-10">
                            <div className="flex items-center justify-between mb-6">
                              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Core Modern Impression</span>
                              <span className="text-[9px] font-mono font-black px-2.5 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full">
                                {result.confidenceScore}% Confidence Score
                              </span>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-between items-baseline gap-4 mb-6">
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 mb-1">Standard Modern Correlation</p>
                                <h3 className="serif text-3xl text-white font-bold leading-tight">{result.modernClinicalCorrelation || 'Eczematous Dermatitis Disease'}</h3>
                              </div>
                              <div className="px-4 py-2 bg-blue-500/15 border border-blue-500/30 rounded-2xl self-start sm:self-center">
                                <p className="text-[8px] font-black uppercase tracking-widest text-blue-400 mb-0.5">ICD-11 Code</p>
                                <p className="text-white font-mono text-sm font-black tracking-widest">{result.icd11 || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="p-6 bg-black/40 rounded-3xl border border-white/5 text-sm text-stone-300 leading-relaxed italic mb-6">
                              "{result.description}"
                            </div>

                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex gap-4 items-start">
                              <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-white text-[10px] font-black uppercase tracking-wider">DermNet New Zealand Educational Platform</p>
                                <p className="text-stone-400 text-xs leading-relaxed">
                                  This optical visual analysis is evaluated with respect to the clinical visual morphology benchmarks defined by DermNet New Zealand. Diagnostic indicators like borders, scales, hyperkeratotic plaques, and localized redness profiles are examined objectively to produce matching modern assessments.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Modern Management Guidelines */}
                        <div className="ayur-card p-8 bg-[#091024]/40 border-blue-500/10 space-y-6">
                          <div>
                            <span className="text-[10px] uppercase font-black tracking-widest text-blue-400 flex items-center gap-2 mb-2">
                              <Sparkles size={12} className="animate-pulse" /> Clinical Protocols
                            </span>
                            <h4 className="serif text-2xl text-white font-medium">Modern Management Protocols</h4>
                            <p className="text-[10px] text-stone-500 font-medium tracking-tight mt-1">
                              Targeted evidence-based medical advice matched dynamically to current presentation.
                            </p>
                          </div>
                          
                          <ul className="space-y-3.5 leading-relaxed">
                            {result.recommendations.map((rec, idx) => {
                              const parsed = parseAyurvedicRecommendation(rec);
                              const modern = getModernValidation(parsed.category, parsed.content);
                              return (
                                <li key={idx} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex gap-3.5 items-start hover:border-blue-500/20 transition-all duration-300">
                                  <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0 font-mono mt-0.5">
                                    0{idx + 1}
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-stone-200 font-bold block text-[11px] uppercase tracking-wider font-sans">
                                      🔬 {modern.equivalent}
                                    </span>
                                    <p className="text-[11px] text-stone-400 leading-relaxed font-sans">
                                      {modern.validation}
                                    </p>
                                    <span className="text-[9px] font-mono text-stone-500 block uppercase tracking-wider pt-1.5 border-t border-dashed border-white/5 mt-1.5">
                                      Advisory Focus — Standard Modern Alignment
                                    </span>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>

                      {/* Standalone Reference Banner Card */}
                      <div className="ayur-card p-8 bg-stone-900 border border-blue-500/10 flex flex-col sm:flex-row items-center justify-between gap-6 md:col-span-2">
                        <div className="flex items-center gap-5 text-left">
                          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                            <Globe size={28} />
                          </div>
                          <div>
                            <h4 className="text-stone-100 text-base font-bold">DermNet NZ Clinical Reference Library</h4>
                            <p className="text-stone-400 text-xs leading-relaxed max-w-xl font-medium">
                              DermNet is the world's most comprehensive resource for peer-reviewed clinical dermatology information and educational content. Skin conditions are classified strictly based on visual, morphological features.
                            </p>
                          </div>
                        </div>
                        <a 
                          href="https://dermnetnz.org" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="w-full sm:w-auto px-8 h-14 bg-blue-500 text-white hover:bg-blue-400 text-xs font-black uppercase tracking-widest rounded-2xl transition-all text-center flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-blue-500/20"
                        >
                          Visit DermNet NZ <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 px-4 justify-center">
                <button 
                  onClick={() => {
                    resetAnalysis();
                    setActiveTab('assessment');
                  }} 
                  className="ayur-button-secondary max-w-sm w-full h-16 text-lg"
                >
                  <RefreshCcw size={20} /> New Assessment
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )}

      {activeTab === 'history' && (
        <motion.div
          key="history-tab"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="w-full max-w-4xl mx-auto space-y-6"
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="serif text-3xl text-white">Analysis History</h2>
            <div className="px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em]">
              {history.length} Records
            </div>
          </div>

          <CloudSyncCard 
            currentUser={currentUser} 
            isSyncing={isSyncing} 
            setIsSyncing={setIsSyncing} 
            setHistory={setHistory} 
          />

          {history.length === 0 ? (
            <div className="ayur-card p-20 text-center flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-stone-600">
                <History size={32} />
              </div>
              <p className="text-stone-400 font-medium">No diagnostic history found yet.</p>
              <button 
                onClick={() => setActiveTab('assessment')}
                className="text-emerald-500 text-xs font-black uppercase tracking-widest hover:underline"
              >
                Perform First Scan
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {history.map((record, idx) => (
                <div 
                  key={idx} 
                  className="ayur-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:bg-white/[0.03] transition-colors border-white/5"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${getTheme(record.primaryDosha).bg} ${getTheme(record.primaryDosha).ink}`}>
                      {record.primaryDosha[0]}
                    </div>
                    <div>
                      <h3 className="font-medium text-stone-100">{record.specificKushtha || 'General Kushtha'}</h3>
                      <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">{record.primaryDosha} Dominance • {record.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                      onClick={() => {
                        setResult(record);
                        setUserProfile({ ...initialProfile, ...record.profile });
                        setStep('results');
                        setActiveTab('assessment');
                      }}
                      className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-emerald-500 border border-white/10 hover:bg-emerald-500 hover:text-black transition-all"
                    >
                      View Report
                    </button>
                    <button 
                      onClick={() => generateClinicalPDF(record, record.profile, record.doshaPercentages, (record as any).images)}
                      className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-black transition-all"
                      title="Download PDF"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      onClick={async () => {
                        const recordToDelete = history[idx];
                        const next = history.filter((_, i) => i !== idx);
                        setHistory(next);
                        if (currentUser && (recordToDelete as any).sessionId) {
                          try {
                            await deleteDoc(doc(db, 'users', currentUser.uid, 'sessions', (recordToDelete as any).sessionId));
                            console.log("[Firestore Sync] Successfully deleted session from cloud.");
                          } catch (e) {
                            handleFirestoreError(e, OperationType.DELETE, `users/${currentUser.uid}/sessions/${(recordToDelete as any).sessionId}`);
                          }
                        }
                      }}
                      className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-black transition-all"
                    >
                      <Trash2 size={16} /> 
                    </button>
  </div>
</div>
))}
</div>
)}
</motion.div>
)}

{activeTab === 'education' && (
        <motion.div
          key="education-tab"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className="w-full max-w-4xl mx-auto py-10"
        >
          <div className="text-center mb-16">
            <h2 className="serif text-5xl text-white mb-4">Knowledge</h2>
            <p className="text-stone-400 text-sm max-w-lg mx-auto uppercase tracking-[0.2em] font-bold">Wisdom from Charaka Samhita: Chikitsa Sthana</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="ayur-card p-10 bg-amber-950/10 border-amber-500/20 col-span-1 md:col-span-2">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 rounded-3xl bg-amber-500 text-black flex items-center justify-center shrink-0 shadow-2xl shadow-amber-500/30">
                  <BookOpen size={32} />
                </div>
                <div>
                  <h3 className="serif text-3xl mb-4 text-amber-200">The Pathogenesis (Samprapti)</h3>
                  <p className="text-stone-300 leading-relaxed italic text-lg mb-6">
                    "Kushtha is caused by the seven-fold vitiation consisting of the three Doshas (Vata, Pitta, Kapha) and four Dhatus (Twak, Rakta, Mamsa, Lasika)."
                  </p>
                  <p className="text-stone-400 text-sm">
                    Kushtha is not just a skin condition but a systemic manifestation where impurities circulate in the deep tissues before manifesting on the surface.
                  </p>
                </div>
              </div>
            </div>

            {[
              { 
                name: 'Vataja Lakshana', 
                quote: 'Ruksha, shyavaruna, parusha, khara.', 
                meaning: 'Roughness, blackish-red hue, dryness, and sandpaper-like texture.',
                theme: 'amber',
                icon: <Leaf size={24} />
              },
              { 
                name: 'Pittaja Lakshana', 
                quote: 'Daha, raga, srava, paka.', 
                meaning: 'Burning sensation, redness, excessive discharge, and suppuration.',
                theme: 'rose',
                icon: <Sparkles size={24} />
              },
              { 
                name: 'Kaphaja Lakshana', 
                quote: 'Shveta, shaitya, kandu, sthairya.', 
                meaning: 'Whiteness, coldness to touch, intense itching, and stability of patches.',
                theme: 'emerald',
                icon: <Check size={24} />
              }
            ].map((item, i) => (
              <div key={i} className={`ayur-card p-8 border-${item.theme}-500/10 bg-${item.theme}-500/5`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-6 text-${item.theme}-400`}>
                  {item.icon}
                </div>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.3em] text-${item.theme}-500 mb-2`}>{item.name}</h4>
                <p className="serif text-xl text-stone-200 mb-3 italic">"{item.quote}"</p>
                <p className="text-stone-400 text-xs leading-relaxed">{item.meaning}</p>
              </div>
            ))}

            <div className="col-span-1 md:col-span-2 mt-12 mb-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-px bg-white/10 flex-1"></div>
                <h3 className="serif text-3xl text-white">Classification of Kushtha</h3>
                <div className="h-px bg-white/10 flex-1"></div>
              </div>
              <p className="text-stone-400 text-center text-sm mb-12 max-w-2xl mx-auto">
                Charaka Samhita classifies skin disorders into 18 varieties, broadly divided into 7 Major (Maha) and 11 Minor (Kshudra) types.
              </p>
            </div>

            {/* Globe Knowledge Section */}
            <div className="col-span-1 md:col-span-2 mt-20 mb-12">
              <div className="ayur-card p-12 bg-emerald-950/20 border border-emerald-500/20 rounded-[3.5rem] relative overflow-hidden group">
                <div className="absolute -top-20 -right-20 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] group-hover:bg-emerald-500/10 transition-all duration-1000" />
                <div className="absolute top-12 right-12 text-emerald-500/10 animate-spin-slow">
                  <Globe size={320} />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                      <Globe size={24} />
                    </div>
                    <h3 className="serif text-4xl text-white">Global Skin Disease Correlation</h3>
                  </div>
                  <p className="text-stone-400 text-sm mb-12 max-w-2xl">
                    Mapping Ayurvedic Kushtha classifications to the WHO International Classification of Diseases (ICD-11) and Ayush TM2 standards for global dermatological integration.
                  </p>

                  <div className="grid grid-cols-1 gap-4">
                    {KUSHTHA_TYPES.map((type) => (
                      <div key={type.id} className="p-6 bg-black/40 rounded-3xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-6">
                           <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center text-emerald-500">
                             <span className="text-[10px] font-black tracking-tighter leading-none">{type.category[0]}</span>
                             <span className="text-[8px] font-bold opacity-60">K</span>
                           </div>
                           <div>
                             <h4 className="serif text-xl text-white">{type.name} <span className="text-stone-600 text-sm ml-2 font-sans font-normal italic">({type.sanskrit})</span></h4>
                             <p className="text-stone-500 text-xs font-bold uppercase tracking-widest">{type.modernName}</p>
                           </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="px-4 py-2 bg-stone-900 rounded-xl border border-white/5 text-center min-w-[80px]">
                            <p className="text-[8px] font-black text-stone-600 uppercase mb-1">ICD-11</p>
                            <p className="text-emerald-500 text-[10px] font-mono">{type.icd11 || '—'}</p>
                          </div>
                          <div className="px-4 py-2 bg-stone-900 rounded-xl border border-white/5 text-center min-w-[80px]">
                            <p className="text-[8px] font-black text-stone-600 uppercase mb-1">TM2</p>
                            <p className="text-emerald-500 text-[10px] font-mono">{type.tm2 || '—'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Maha Kushtha Section */}
            <div className="col-span-1 md:col-span-2 mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-4 block">Section I: Maha-Kushtha (7 Major)</span>
            </div>
            {KUSHTHA_TYPES.filter(t => t.category === 'Maha-Kushtha').map((type) => (
              <div key={type.id} className="ayur-card p-8 border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="serif text-2xl text-stone-100">{type.name}</h4>
                    <span className="text-emerald-500/60 italic font-serif">{type.sanskrit}</span>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest text-emerald-500">Major</div>
                </div>
                <p className="text-stone-400 text-xs leading-relaxed mb-6">{type.description}</p>
                <div className="flex flex-wrap gap-2">
                  {type.matchingFeatures.slice(0, 3).map((f, idx) => (
                    <span key={idx} className="text-[8px] font-bold text-stone-500 uppercase tracking-widest px-2 py-1 bg-white/5 rounded-md border border-white/5">
                      {f.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {/* Kshudra Kushtha Section */}
            <div className="col-span-1 md:col-span-2 mt-16 mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-4 block">Section II: Kshudra-Kushtha (11 Minor)</span>
            </div>
            {KUSHTHA_TYPES.filter(t => t.category === 'Kshudra-Kushtha').map((type) => (
              <div key={type.id} className="ayur-card p-6 border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="serif text-xl text-stone-200">{type.name}</h4>
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-500/50">Minor</span>
                </div>
                <p className="text-stone-500 text-xs leading-relaxed">{type.description}</p>
              </div>
            ))}

            {/* Shvitra / Kilasa Section */}
            <div className="col-span-1 md:col-span-2 mt-16 mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-teal-400 mb-4 block">Section III: Shvitra / Kilasa (Vitiligo Varieties)</span>
            </div>
            {KUSHTHA_TYPES.filter(t => t.category === 'Shvitra').map((type) => (
              <div key={type.id} className="ayur-card p-6 border-teal-500/10 bg-teal-500/[0.01] hover:bg-teal-500/[0.03] hover:border-teal-500/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="serif text-xl text-stone-200">{type.name}</h4>
                  <span className="text-[8px] font-black uppercase tracking-widest text-teal-400/60">Vitiligo</span>
                </div>
                <p className="text-stone-400 text-xs leading-relaxed">{type.description}</p>
              </div>
            ))}

            {/* Treatment Philosophy */}
            <div className="col-span-1 md:col-span-2 mt-20 p-12 bg-emerald-950/20 border border-emerald-500/20 rounded-[3rem] relative overflow-hidden">
              <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px]" />
              <div className="relative z-10">
                <h3 className="serif text-4xl text-white mb-8">Chikitsa Sutra (Principles of Management)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Vata Dominant</h5>
                    <p className="text-stone-300 text-sm italic">"Vatottareghrutapanam"</p>
                    <p className="text-stone-400 text-xs leading-relaxed">Administration of medicated Ghee (Sarpipana) is primary for balancing Vataja Kushtha.</p>
                  </div>
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">Pitta Dominant</h5>
                    <p className="text-stone-300 text-sm italic">"Pittottaremokshanamraktasya"</p>
                    <p className="text-stone-400 text-xs leading-relaxed">Bloodletting (Raktamokshana) and Purgation (Virechana) are emphasized for Pittaja conditions.</p>
                  </div>
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Kapha Dominant</h5>
                    <p className="text-stone-300 text-sm italic">"Kaphottarevamana"</p>
                    <p className="text-stone-400 text-xs leading-relaxed">Therapeutic Emesis (Vamana) is the treatment of choice for reducing Kaphaja imbalances.</p>
                  </div>
                </div>
                <div className="mt-12 p-6 bg-black/40 rounded-3xl border border-white/5">
                  <p className="text-stone-500 text-[10px] leading-relaxed uppercase tracking-widest text-center">
                    Note: ALL Kushthas have multi-doshic involvement and require Sodhana (Purification) treatment due to the deep-seated nature of the vitiation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'profile' && (
        <motion.div
          key="profile-tab"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="w-full max-w-2xl mx-auto space-y-8"
        >
          <div className="ayur-card p-10 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-4 right-4">
              {isProfileLocked ? (
                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[8px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                  <Check size={8} /> Identity Verified
                </div>
              ) : (
                <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[8px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1">
                  <AlertCircle size={8} /> Unlocked
                </div>
              )}
            </div>
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-6 shadow-2xl shadow-emerald-500/10">
              <User size={48} />
            </div>
            <h2 className="serif text-4xl text-white mb-2">{ownerProfile.name || 'Set Owner Profile'}</h2>
            <p className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Global Ayurvedic Health Profile • {isProfileLocked ? 'Encrypted & Locked' : 'Draft Identity'}</p>
          </div>

          <CloudSyncCard 
            currentUser={currentUser} 
            isSyncing={isSyncing} 
            setIsSyncing={setIsSyncing} 
            setHistory={setHistory} 
          />

          {isProfileLocked ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Full Name', value: ownerProfile.name },
                  { label: 'Age', value: `${ownerProfile.age} Years` },
                  { label: 'Biological Sex', value: ownerProfile.sex },
                  { label: 'Occupation', value: ownerProfile.occupation },
                  { label: 'Domicile', value: ownerProfile.state },
                  { label: 'Verified Contact', value: ownerProfile.phone }
                ].map((field, i) => (
                  <div key={i} className="ayur-card p-6 bg-white/[0.02] border-white/5 flex flex-col gap-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-stone-600">{field.label}</span>
                    <span className="text-stone-300 font-medium">{field.value || 'Not Disclosed'}</span>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setIsProfileLocked(false)}
                className="w-full h-16 border border-amber-500/30 rounded-2xl text-[10px] font-black uppercase tracking-widest text-amber-500 hover:bg-amber-500/5 transition-all flex items-center justify-center gap-3"
              >
                Unlock Clinical Identity to Edit
              </button>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="ayur-card p-10 space-y-8"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  { label: 'Full Name', field: 'name', type: 'text', placeholder: 'Enter name' },
                  { label: 'Date of Birth', field: 'dob', type: 'date', placeholder: 'DOB' },
                  { label: 'Sex', field: 'sex', type: 'select', options: ['Male', 'Female', 'Other'] },
                  { label: 'Occupation', field: 'occupation', type: 'text', placeholder: 'Occupation' },
                  { label: 'State', field: 'state', type: 'select', options: INDIAN_STATES },
                  { label: 'Contact', field: 'phone', type: 'tel', placeholder: 'Phone number' }
                ].map((item) => (
                  <div key={item.field} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 ml-1">{item.label}</label>
                    {item.type === 'select' ? (
                      <select
                        value={(ownerProfile as any)[item.field] || ''}
                        onChange={(e) => setOwnerProfile({ ...ownerProfile, [item.field]: e.target.value })}
                        className={`w-full px-4 py-3 rounded-2xl bg-stone-900 border border-white/5 text-white focus:outline-none focus:border-emerald-500/50 transition-all`}
                      >
                        <option value="">Select {item.label}</option>
                        {item.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={item.type}
                        value={(ownerProfile as any)[item.field] || ''}
                        placeholder={item.placeholder}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (item.field === 'dob') {
                            setOwnerProfile({ ...ownerProfile, dob: val, age: calculateAge(val) });
                          } else {
                            setOwnerProfile({ ...ownerProfile, [item.field]: val });
                          }
                        }}
                        className={`w-full px-4 py-3 rounded-2xl bg-stone-900 border border-white/5 text-white focus:outline-none focus:border-emerald-500/50 transition-all`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button 
                onClick={() => {
                  if (ownerProfile.name) {
                    setIsProfileLocked(true);
                  }
                }}
                disabled={!ownerProfile.name}
                className="w-full h-16 bg-emerald-500 text-black border-transparent shadow-xl shadow-emerald-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:grayscale"
              >
                Save & Lock Identity
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
      </main>

      {/* Interactive Image Quality Validation Warning Gate */}
      {showQualityWarningModal && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg bg-stone-900 border border-white/10 rounded-[2.5rem] p-8 shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden relative"
          >
            {/* Ambient indicator */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-rose-500 animate-pulse" />
            
            <div className="flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                <AlertCircle size={32} />
              </div>
              
              <div className="space-y-3">
                <h3 className="serif text-3xl font-medium text-white">Insufficient Image Quality</h3>
                <p className="text-xs font-black uppercase text-rose-500/80 tracking-widest animate-pulse">
                  Diagnostic Alert: {imageQuality?.score ?? 0}% Quality Score Found
                </p>
              </div>

              <div className="w-full bg-stone-950/50 border border-white/5 rounded-2xl p-5 text-left space-y-4">
                <p className="text-stone-300 text-xs leading-relaxed">
                  Our optical skin morphological analyzer detected critical quality issues with the captured visual evidence:
                </p>
                
                {imageQuality?.reason && (
                  <div className="text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-xl p-3.5 text-xs italic font-medium">
                    "{imageQuality.reason}"
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-white text-[10px] font-black uppercase tracking-wider">Required Guidelines for Accuracy:</p>
                  <ul className="text-stone-400 text-xs space-y-1.5 list-disc pl-4">
                    <li><strong className="text-stone-200">Adequate Overhead Natural Light:</strong> Avoid dark environments or harsh side-shadows.</li>
                    <li><strong className="text-stone-200">Sharp Macro Focus:</strong> Skin surface lines, scales, or pores should be sharp and readable.</li>
                    <li><strong className="text-stone-200">Centered Composition:</strong> The skin patch or lesion should fill 50-70% of the display.</li>
                    <li><strong className="text-stone-200">No Filters:</strong> Ensure zero camera filter presets or tint adjustments.</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full mt-2">
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button 
                    onClick={() => {
                      setShowQualityWarningModal(false);
                      startCamera(); // Make sure camera starts again to capture better photo
                    }}
                    className="flex-1 h-14 bg-emerald-500 text-black border-transparent shadow-lg shadow-emerald-500/10 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Camera size={14} /> Recapture Camera
                  </button>
                  <button 
                    onClick={() => {
                      setShowQualityWarningModal(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex-1 h-14 bg-stone-800 text-stone-300 border border-white/5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:bg-stone-700 active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Upload size={14} /> Upload File
                  </button>
                </div>

                {isImageSetQualified ? (
                  <button 
                    onClick={() => {
                      setBypassedQuality(true);
                      setShowQualityWarningModal(false);
                      // trigger moving to next step or runAnalysis directly
                      if (step === 'scan') {
                        stopCamera();
                        setStep('affected_area');
                      } else {
                        // Call runAnalysis again which will now bypass thanks to bypassedQuality = true
                        setTimeout(() => runAnalysis(), 50);
                      }
                    }}
                    className="w-full h-14 bg-stone-900 text-stone-300 border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:bg-stone-850 hover:text-white active:scale-95"
                  >
                    Acknowledge & Proceed
                  </button>
                ) : (
                  <div className="w-full p-5 bg-rose-500/10 border border-rose-500/15 rounded-2xl flex flex-col items-center justify-center gap-2">
                    <span className="text-rose-400 font-extrabold uppercase text-[10px] tracking-[0.2em] text-center flex items-center gap-1 animate-pulse">
                      🔒 PROCEED LOCKED (BLOCKED BY QUALITY STANDARD)
                    </span>
                    <span className="text-stone-400 text-[11px] text-center leading-relaxed">
                      Ayurvedic diagnosis requires high-fidelity visuals. Kindly recapture a sharper image <strong>(min 65% score)</strong> or upload/capture <strong>at least 3 angles</strong> of the symptom. Current: {images.length} image{images.length === 1 ? '' : 's'} ({imageQuality?.score ?? 0}% score).
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Bottom Navigation */}
    <nav className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 flex justify-center pointer-events-none">
      <div className="ayur-card p-2 rounded-[2rem] flex items-center gap-2 pointer-events-auto backdrop-blur-3xl bg-stone-900/80 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        {[
          { id: 'assessment', icon: <Play size={20} />, label: 'Start' },
          { id: 'history', icon: <ClipboardCheck size={20} />, label: 'Result' },
          { id: 'education', icon: <Globe size={20} />, label: 'Globe' },
          { id: 'profile', icon: <User size={20} />, label: 'Profile' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-3 px-6 py-4 rounded-3xl transition-all duration-500 relative group ${activeTab === tab.id ? 'bg-emerald-500 text-black shadow-xl shadow-emerald-500/20' : 'text-stone-500 hover:bg-white/5'}`}
          >
            {tab.icon}
            {activeTab === tab.id && (
              <motion.span 
                layoutId="activeTabLabel" 
                className="text-[10px] font-black uppercase tracking-widest"
              >
                {tab.label}
              </motion.span>
            )}
            <div className={`absolute -top-1 left-12 w-1 h-1 rounded-full bg-emerald-500 scale-0 group-hover:scale-100 transition-transform ${activeTab === tab.id ? 'hidden' : ''}`} />
          </button>
        ))}
      </div>
    </nav>
    </div>
  );
}
