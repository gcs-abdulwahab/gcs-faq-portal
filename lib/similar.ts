// Lightweight keyword matcher used to find existing FAQs similar to a visitor's question.
// Works on English and Roman Urdu by ignoring common filler words and matching word stems.

import { toPlainText } from "./richText";

export interface MatchableFaq {
  id: string;
  faq_code: string;
  category: string;
  question: string;
  answer: string;
}

const STOPWORDS = new Set(
  (
    // English
    "a an the and or but if of to in on at for from by with about into over after before during is are was were be been " +
    "being am do does did doing have has had having i me my we our you your he she it its they them their this that these " +
    "those what which who whom whose when where why how can could should would will shall may might must not no yes there " +
    "here any some all each more most other such only own same so than too very just also get got please tell know want " +
    "need regarding question questions sir madam kindly " +
    // Roman Urdu
    "ka ke ki ko se mein main me mai hai ha hain hy he ho hoga hogi hongay honge hoon tha thi thay kya kia kyun kyon kab " +
    "kaise kaisay kese kesay kahan kidhar jo jis jin jinke jinki woh wo yeh ye is us un in aur ya bhi to tou na nahi nahin " +
    "nai koi kuch sab aik ek zada zyada ziada wala wali walay walon karna karen karein karo kar krna krain kry krygy " +
    "karenge karengay krenge krna hum ap aap apna apni mera meri hamara hamari liye lie liay sakta sakti sakte skta"
  ).split(/\s+/)
);

// Local terms mapped onto words used in the FAQs.
const SYNONYMS: Record<string, string[]> = {
  supply: ["repeat", "failed", "improve", "re-register"],
  supli: ["repeat", "failed", "improve"],
  resit: ["repeat", "re-register", "improve"],
  reappear: ["repeat", "failed"],
  fail: ["failed", "repeat"],
  admit: ["roll", "slip"],
  rollno: ["roll", "slip"],
  datesheet: ["date", "sheet"],
  wazifa: ["scholarship", "financial"],
  fees: ["fee", "challan"],
  result: ["results", "declared"],
  recheck: ["re-checking", "re-totaling"],
  rechecking: ["re-checking", "re-totaling"],
  freeze: ["freezing", "frozen"],
  noc: ["objection", "migration"],
  bonafide: ["enrollment", "verification"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function expand(tokens: string[]): string[] {
  const out = new Set(tokens);
  tokens.forEach((t) => SYNONYMS[t]?.forEach((s) => out.add(s)));
  return [...out];
}

// Two words match if equal, or if they share a stem of 5+ letters (register / registration).
function wordsMatch(a: string, b: string) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 5) return false;
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= 5;
}

export function findSimilarFaqs<T extends MatchableFaq>(text: string, faqs: T[], limit = 3): T[] {
  const original = tokenize(text);
  if (original.length === 0) return [];
  const queryTokens = expand(original);

  const scored = faqs.map((faq) => {
    const qWords = tokenize(faq.question + " " + faq.category + " " + faq.faq_code);
    const aWords = tokenize(toPlainText(faq.answer));
    let score = 0;
    let questionHits = 0;
    for (const t of queryTokens) {
      if (qWords.some((w) => wordsMatch(t, w))) {
        score += 2;
        questionHits++;
      } else if (aWords.some((w) => wordsMatch(t, w))) {
        score += 1;
      }
    }
    return { faq, score: score / (original.length * 2), questionHits };
  });

  return scored
    .filter((s) => s.questionHits >= 1 && s.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.faq);
}
