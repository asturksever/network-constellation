// The classification rules. Everything the classifier knows lives here —
// this is the file to edit when a bucket is wrong or a term is missing.
//
// Order matters. DOMAINS is tried top to bottom and the FIRST match wins as
// the primary domain, so the list runs most-specific to most-general. A
// headline reading "Geospatial AI" lands in GIS, not AI, because GIS sits
// higher. Every match is still recorded in `doms`, so nothing is lost.

export const DOMAINS = [
  ['Surveying, Drone & LiDAR', /\b(lidar|point cloud|photogrammetr|uav|drone|surveyor|land survey|geodes|geodet|mobile mapping|laser scan|total station|gnss|rtk|ppk|hydrograph)\w*/i],
  ['Earth Observation & RS', /\b(remote sensing|earth observation|satellite|sentinel|landsat|\bsar\b|multispectral|hyperspectral|geospatial imagery|aerial imagery|orthophoto|ndvi|copernicus|\beo\b)\w*/i],
  ['Mapping & Navigation', /\b(openstreetmap|\bosm\b|mapillary|tomtom|here technologies|here maps|navigation|geocod|cartograph|basemap|map data|mapping data|street[- ]level|poi\b|routing|wayfinding|digital map|map production|mapmaker|map maker)\w*/i],
  ['GIS & Spatial Analysis', /\b(\bgis\b|geospatial|geographic information|spatial analy|spatial data|arcgis|qgis|esri|geograph|geoinformat|geomatic|geo[- ]?data|postgis|geoscien|topograph)\w*/i],
  ['AV, Automotive & Fleet', /\b(autonomous vehicle|self[- ]driving|\badas\b|automotive|telematic|dashcam|fleet manage|\bav\b stack|robotaxi|mobility as a service)\w*/i],
  ['Urban Planning & Mobility', /\b(urban plan|town plan|city plan|urbanis|urbanism|urbanista|transport plan|transportation|traffic|active travel|cycling|pedestrian|public transit|urban mobility|urban analytic|urban design|placemaking|walkab)\w*/i],
  ['Climate & Environment', /\b(climate|sustainab|environmental|biodiversit|carbon|\besg\b|conservation|renewable|net zero|ecolog|forestr|agritech|precision agricultur|water resource|nature[- ]risk)\w*/i],
  ['Defence, Security & OSINT', /\b(defen[cs]e|osint|intelligence analyst|geoint|military|national security|situational awareness|border security)\w*/i],
  ['Real Estate & Construction', /\b(real estate|proptech|construction|\bbim\b|civil engineer|architect|infrastructure delivery|quantity survey|built environment|housebuild|homebuild|facilit(y|ies) manage)\w*/i],
  ['Insurance, Risk & Finance', /\b(insur|reinsur|actuar|underwrit|risk model|catastrophe|investment|venture capital|private equity|fintech|financ)\w*/i],
  ['AI & Machine Learning', /\b(machine learning|deep learning|artificial intelligence|\bai\b|\bml\b|computer vision|\bllm\b|neural|generative ai|\bnlp\b|data scien|ai agent|agentic)\w*/i],
  ['Data Engineering & Analytics', /\b(data engineer|data analy|analytics|business intelligence|\bbi\b|data platform|data warehouse|databricks|snowflake|\betl\b|big data|data architect|data governance|data quality)\w*/i],
  ['Software & Cloud', /\b(software engineer|software develop|full[- ]?stack|backend|back[- ]end|frontend|front[- ]end|devops|cloud engineer|web develop|react|python develop|\bsre\b|platform engineer|solutions architect|programmer)\w*/i],
  ['Product & Program', /\b(product manage|product owner|product lead|program manage|programme manage|project manage|\btpm\b|product design|scrum|agile coach|delivery manage)\w*/i],
  ['Sales, BD & Marketing', /\b(business development|\bbd\b|sales|partnership|account (executive|manager|director)|growth|marketing|customer success|revenue|go[- ]to[- ]market|commercial director|brand)\w*/i],
  ['Government & Public Sector', /\b(city of|county of|department of transportation|\bdot\b|municipal|government|ministry|public sector|council|civil service|federal|state agency|ordnance survey|national mapping|statistics (canada|office)|civic)\w*/i],
  ['Academia & Research', /\b(professor|lecturer|postdoc|post[- ]doc|phd|doctoral|researcher|research fellow|research scien|university|academic|scholar|msc|\bm\.?sc\b|student)\w*/i],
  ['Recruitment & HR', /\b(recruit|talent acquisition|headhunt|human resources|\bhr\b|staffing|hiring manager)\w*/i]
];

// Non-English and adjacent terms folded into the tier-1 buckets above.
export const DOM_EXTRA = {
  'GIS & Spatial Analysis': /\b(geomática|geomatique|géomatique|coğraf|cbs\b|\bsig\b|geoinformación|geoespacial|geoinformasi|geodata|location intelligence|location data|spatial)\w*/i,
  'Mapping & Navigation': /\b(harita|kartograf|cartografía|cartographie|pemetaan|карт|mapeo|mapeamento|maps? (data|team|platform)|地图)\w*/i,
  'Surveying, Drone & LiDAR': /\b(vermessung|geodäsie|topografi|levantamiento|topógrafo|arpentage|jeodezi|harita mühendis)\w*/i,
  'Earth Observation & RS': /\b(penginderaan jauh|teledetección|télédétection|uzaktan algılama|fernerkundung|geospatial intelligence)\w*/i,
  'Urban Planning & Mobility': /\b(urbanístic|urbanismo|urbanisme|şehir plan|kentsel|ulaşım|stadtplanung|movilidad|mobilité|logistics|supply chain|last[- ]mile|delivery network|rail\b|aviation|maritime|port operations)\w*/i,
  'Academia & Research': /\b(üniversite|universidad|universität|université|dosen|mahasiswa|estudiante|étudiant|öğrenci|ausbildung|studium|instructor|teaching|academy|school of)\w*/i
};

// Only tried when nothing above matched — keeps the geo taxonomy precise
// while still placing the rest of the world somewhere.
export const DOM_TIER2 = [
  ['Energy & Utilities', /\b(energy|utilit|power grid|electric|oil (and|&) gas|petroleum|pipeline|solar|wind farm|nuclear|water compan|telecom|fiber|fibre|5g\b|network planning)\w*/i],
  ['Health & Life Sciences', /\b(health|medical|pharma|clinical|hospital|biotech|epidemiolog|public health|nurse|doctor)\w*/i],
  ['Consulting & Prof. Services', /\b(consultan|consulting|advisory|freelance|independent contractor|professional services|strategy consult)\w*/i],
  ['Design, Media & Content', /\b(design|creator|content|media|journalis|photograph|video|storytell|community manager|social media|writer|editor)\w*/i],
  ['Legal & Compliance', /\b(legal|lawyer|attorney|abogado|avukat|compliance|regulatory|policy advisor|governance)\w*/i],
  ['Operations & Manufacturing', /\b(operations|manufactur|supply|procurement|logistics coordinator|quality assurance|production|mechanical engineer|electrical engineer|industrial)\w*/i],
  ['Finance & Accounting', /\b(account|audit|tax|bookkeep|controller|treasur|banking)\w*/i],
  ['Engineering (other)', /\b(engineer|engineering|mühendis|ingenier|ingénieur|ingeniero)\w*/i],
  ['General management', /\b(ceo|founder|chief|president|director|managing|executive|entrepreneur|business owner)\w*/i]
];

// Highest match wins, so this runs top down too.
export const SENIORITY = [
  ['Founder & C-suite', /\b(founder|co[- ]?founder|\bceo\b|\bcto\b|\bcoo\b|\bcpo\b|\bcdo\b|\bcfo\b|\bcio\b|\bcmo\b|\bcro\b|\bcso\b|\bciso\b|\bcbo\b|\bcco\b|chief\s+[\w-]+\s+officer|chief executive|chief technolog|chief scientist|president\b|managing director|owner\b|proprietor|entrepreneur)\b/i],
  ['VP, Head & Director', /\b(vice president|\bvp\b|\bsvp\b|\bevp\b|head of|director|partner\b|general manager|board member|chief\b)\b/i],
  ['Manager & Lead', /\b(manager|\blead\b|leader|principal|supervisor|team lead|chapter lead|foreman|coordinator of)\b/i],
  ['Senior IC', /\b(senior|\bsr\.?\b|staff\s+\w+|specialist|expert|consultant|advisor|adviser|profess(or|eur)|profesor|architect|scholar|fellow)\b/i],
  ['Student & Early career', /\b(student|intern\b|internship|graduate|\bjunior\b|trainee|candidate|apprentice|seeking|looking for (a )?(new )?(role|opportunit)|aspiring)\b/i],
  ['Individual contributor', /\b(engineer|ingénieur|ingeniero|mühendis|analyst|developer|scientist|technician|officer|associate|assistant|executive|planner|surveyor|cartographer|designer|editor|operator|programmer|researcher|lecturer|teacher|writer|administrador|administrator|chargé|urbanista|geographer)\b/i]
];

export const SEN_EXTRA = /\b(gerente|jefe|responsable|directeur|geschäftsführer|müdür|genel müdür|kurucu|fundador|gründer|sahibi|başkan)\b/i;

export const SEN_ORDER = [
  'Founder & C-suite', 'VP, Head & Director', 'Manager & Lead',
  'Senior IC', 'Individual contributor', 'Student & Early career', 'Unstated'
];

// Words that are never an employer, however they were written.
export const COMPANY_STOPWORDS = /^(the|a|an|home|work|scale|university|college|school|city|state|large|my|our|your|this|that|present|current|various|multiple|stealth|self|freelance|remote|it|and|or)$/i;
