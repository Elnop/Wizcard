// scripts/card-assets/asset-version.mjs
//
// Source unique du commit Full Magic Pack utilisé par le pipeline d'assets.
// Module pur (aucun I/O) : generate-manifests.mjs et crown-compat.mjs en
// dépendent tous les deux, et crown-compat.mjs doit rester sans effet de bord
// (il est aussi importé par seed-local-crowns.mjs, un script jetable qui ne
// doit jamais toucher au filesystem ou au réseau avant d'en décider lui-même).
// Bumper le pack se fait ICI, une seule fois : frame_paths et crown_paths en
// dérivent tous les deux et ne peuvent plus diverger.
export const ASSET_VERSION = 'bcdf4190b4bf';
