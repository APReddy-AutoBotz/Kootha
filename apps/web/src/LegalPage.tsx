const pages = {
  "/privacy": {
    title: "Privacy Notice / గోప్యతా నోటీసు",
    sections: [
      ["What we collect / మేము సేకరించేది", "We collect enquiry contact details, work planning records, driver consent, work updates, private proof photos, and foreground Phone Location Proof when enabled. / విచారణ వివరాలు, పని రికార్డులు, డ్రైవర్ సమ్మతి, ప్రైవేట్ ఫోటో ఆధారం మరియు అనుమతించినప్పుడు పని సమయంలో ఫోన్ లొకేషన్ ఆధారం సేకరిస్తాము."],
      ["Who can see it / ఎవరు చూడగలరు", "Kootha admins use operational records. Customers do not receive raw coordinates, private proof paths, or a live driver location link. / కూత అడ్మిన్లు మాత్రమే ఆపరేషనల్ రికార్డులను చూస్తారు. కస్టమర్లకు ముడి లొకేషన్, ప్రైవేట్ ఫోటో మార్గం లేదా లైవ్ లొకేషన్ లింక్ ఇవ్వము."],
      ["Retention / నిల్వ కాలం", "Unconverted enquiries: 180 days. Raw location points: 90 days after closure. Proof photos and final summaries: 12 months. Audit logs: 12 months. Operational records: 24 months, subject to legal review. / చట్టపరమైన సమీక్షకు లోబడి ఈ కాలపరిమితులు వర్తిస్తాయి."],
      ["Your choices / మీ ఎంపికలు", "You may ask for access, correction, or deletion through the Data Request page. Some records may be retained where legally required. / డేటా అభ్యర్థన పేజీ ద్వారా యాక్సెస్, సవరణ లేదా తొలగింపు కోరవచ్చు."]
    ]
  },
  "/terms": {
    title: "Terms of Use / వినియోగ నిబంధనలు",
    sections: [
      ["Service confirmation / సేవ నిర్ధారణ", "An enquiry is not a confirmed booking. Availability, scope, schedule, proof, and payment are agreed before work begins. / విచారణ బుకింగ్ కాదు. పని మొదలయ్యే ముందు అందుబాటు, పని పరిధి, సమయం, ఆధారం మరియు చెల్లింపు నిర్ధారిస్తాము."],
      ["Proof limits / ఆధారం పరిమితులు", "Phone Location Proof and photos are supporting evidence only. Kootha does not promise a certified route, map result, or distance result based on phone location, or customer live tracking. / ఫోన్ లొకేషన్ మరియు ఫోటోలు సహాయక ఆధారం మాత్రమే."],
      ["Acceptable use / సరైన వినియోగం", "Do not submit unlawful, abusive, deceptive, or third-party confidential content. / చట్టవిరుద్ధమైన, మోసపూరితమైన లేదా ఇతరుల గోప్య సమాచారాన్ని పంపవద్దు."]
    ]
  },
  "/driver-consent": {
    title: "Driver Location and Photo Consent / డ్రైవర్ లొకేషన్ మరియు ఫోటో సమ్మతి",
    sections: [
      ["During assigned work / కేటాయించిన పని సమయంలో", "Foreground location is used only after you open assigned work, agree, and start work. It stops after work ends. Background location is not used. / మీరు సమ్మతించి పని ప్రారంభించిన తర్వాత మాత్రమే లొకేషన్ ఉపయోగిస్తాము. పని ముగిసిన తర్వాత ఆగుతుంది."],
      ["Photo proof / ఫోటో ఆధారం", "Work photos are used as proof and reviewed by admins. They remain private unless approved proof is included in a customer-safe update. / పని ఫోటోలు ఆధారంగా అడ్మిన్ సమీక్షిస్తారు."],
      ["No default live tracking / డిఫాల్ట్ లైవ్ ట్రాకింగ్ లేదు", "Customers do not receive a live driver location link by default. / కస్టమర్లకు డిఫాల్ట్‌గా లైవ్ డ్రైవర్ లొకేషన్ లింక్ ఇవ్వము."]
    ]
  },
  "/data-request": {
    title: "Data Request / డేటా అభ్యర్థన",
    sections: [
      ["Access, correction, or deletion / యాక్సెస్, సవరణ లేదా తొలగింపు", "Contact the Kootha team using the public contact number and state that you are making a privacy request. We verify identity before acting. Never send passwords, Work Codes, keys, or GPS coordinates. / గోప్యతా అభ్యర్థన కోసం కూత బృందాన్ని సంప్రదించండి. పాస్‌వర్డ్, వర్క్ కోడ్, కీలు లేదా GPS వివరాలు పంపవద్దు."],
      ["Response / స్పందన", "We acknowledge the request, explain legally required retention, and record the outcome without exposing private data. / అభ్యర్థనను స్వీకరించి, అవసరమైన నిల్వ గురించి వివరిస్తాము."]
    ]
  }
} as const;

export function isLegalPath(pathname: string): pathname is keyof typeof pages {
  return pathname in pages;
}

export function LegalPage({ pathname }: { pathname: keyof typeof pages }) {
  const page = pages[pathname];
  return (
    <main className="legal-page">
      <header><a href="/"><img src="/assets/kootha-logo.svg" alt="Kootha" /></a><a className="secondary-button" href="/">Back to home</a></header>
      <article>
        <p className="eyebrow">Kootha</p><h1>{page.title}</h1>
        <p className="legal-updated">Effective 12 July 2026.</p>
        {page.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}
      </article>
    </main>
  );
}
