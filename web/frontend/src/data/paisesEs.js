/**
 * Nombres de país en español para formularios (se guardan en BD como texto).
 * Generado con Intl.DisplayNames; fallback mínimo si no hay soporte.
 */
const ISO_3166_1_ALPHA2 = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(
  /\s+/
);

function buildList() {
  if (typeof Intl === 'undefined' || !Intl.DisplayNames) {
    return [
      'Argentina',
      'Bolivia',
      'Brasil',
      'Chile',
      'Colombia',
      'Costa Rica',
      'Cuba',
      'Ecuador',
      'El Salvador',
      'España',
      'Estados Unidos',
      'Guatemala',
      'Honduras',
      'México',
      'Nicaragua',
      'Panamá',
      'Paraguay',
      'Perú',
      'Puerto Rico',
      'República Dominicana',
      'Uruguay',
      'Venezuela',
    ].sort((a, b) => a.localeCompare(b, 'es'));
  }
  const dn = new Intl.DisplayNames(['es'], { type: 'region' });
  const set = new Set();
  for (const code of ISO_3166_1_ALPHA2) {
    try {
      const name = dn.of(code);
      if (name && typeof name === 'string') set.add(name);
    } catch {
      /* ignorar códigos no soportados */
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

export const PAISES_ES = buildList();
