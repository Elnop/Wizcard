import * as fs from 'node:fs';
import { evaluate, Unresolved } from './evaluate';
import { parseExpression, unwrapFieldValue } from './parser';
import { buildScope } from './scope';
import { GEOMETRY_FIELDS, readStyleFile, type GeometryField } from './style-file';

const { readFileSync } = fs;
// `globSync` existe à l'exécution (Node 22) mais @types/node reste figé sur
// ^20 pour le reste du repo : on ne bascule pas cette dépendance partagée
// pour une seule commande, donc on complète le typage localement.
const globSync = (fs as unknown as { globSync: (pattern: string) => string[] }).globSync;

/** Zones exigées pour qu'un gabarit soit publiable. Voir « aucun fallback ». */
const REQUIRED_FIELDS: GeometryField[] = ['image', 'name', 'type', 'text'];
const BOX_KEYS = ['left', 'top', 'width', 'height'] as const;

export interface ResolvedBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface TemplateGeometry {
	cardWidth: number;
	cardHeight: number;
	boxes: Partial<Record<GeometryField, ResolvedBox>>;
	/** AST conservé pour permettre une évaluation dynamique plus tard. */
	ast: Partial<Record<GeometryField, Record<string, unknown>>>;
}

export interface ExtractionReport {
	total: number;
	resolved: number;
	rejected: Array<{ id: string; field: string; key: string; reason: string }>;
	/** Noms manquants, triés par nombre de gabarits bloqués — la file de travail. */
	missingByName: Array<[string, number]>;
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- safe: une passe par gabarit x champ x clé, dérouler fragmenterait la logique de rejet sans la simplifier
export function extractAll(corpusRoot: string): {
	geometries: Map<string, TemplateGeometry>;
	report: ExtractionReport;
} {
	const gameScript = readFileSync(`${corpusRoot}/magic.mse-game/script`, 'utf8');
	const files = globSync(`${corpusRoot}/*.mse-style/style`);
	const geometries = new Map<string, TemplateGeometry>();
	const rejected: ExtractionReport['rejected'] = [];
	const missing = new Map<string, Set<string>>();

	for (const file of files) {
		const style = readStyleFile(file, corpusRoot);
		if (!style) continue;
		const scope = buildScope(readFileSync(file, 'utf8'), gameScript, style.fontFields);
		const boxes: TemplateGeometry['boxes'] = {};
		const ast: TemplateGeometry['ast'] = {};
		let ok = true;

		for (const field of GEOMETRY_FIELDS) {
			const raw = style.fields[field];
			if (!raw) {
				// Un champ REQUIS absent disqualifie : on ne comble pas.
				if (REQUIRED_FIELDS.includes(field)) {
					rejected.push({ id: style.id, field, key: '*', reason: 'champ absent' });
					ok = false;
				}
				continue;
			}
			const box: Partial<ResolvedBox> = {};
			const fieldAst: Record<string, unknown> = {};
			for (const key of BOX_KEYS) {
				const value = raw[key];
				if (value === undefined) continue;
				const source = unwrapFieldValue(value);
				if (source === null) {
					rejected.push({ id: style.id, field, key, reason: 'bloc script:' });
					if (REQUIRED_FIELDS.includes(field)) ok = false;
					continue;
				}
				try {
					const node = parseExpression(source);
					fieldAst[key] = node;
					const value = evaluate(node, scope);
					// `evaluate` peut désormais renvoyer le littéral `nil` (tâche 6d,
					// `Value` inclut `null`) : `Number(null)` vaudrait 0 silencieusement,
					// un fallback déguisé. Une géométrie n'est JAMAIS censée être `nil`
					// dans le corpus — donc refuser plutôt que deviner « 0 ».
					if (value === null) throw new Unresolved(`${field}.${key} vaut nil`);
					box[key] = Number(value);
				} catch (error) {
					const reason = error instanceof Unresolved ? error.what : (error as Error).message;
					rejected.push({ id: style.id, field, key, reason });
					if (REQUIRED_FIELDS.includes(field)) ok = false;
					if (error instanceof Unresolved) {
						const set = missing.get(error.what) ?? new Set<string>();
						set.add(style.id);
						missing.set(error.what, set);
					}
				}
			}
			if (BOX_KEYS.every((key) => typeof box[key] === 'number')) {
				boxes[field] = box as ResolvedBox;
				ast[field] = fieldAst;
			} else if (REQUIRED_FIELDS.includes(field)) {
				ok = false;
			}
		}

		if (ok) {
			geometries.set(style.id, {
				cardWidth: style.cardWidth,
				cardHeight: style.cardHeight,
				boxes,
				ast,
			});
		}
	}

	return {
		geometries,
		report: {
			total: files.length,
			resolved: geometries.size,
			rejected,
			missingByName: [...missing.entries()]
				.map(([name, ids]): [string, number] => [name, ids.size])
				.sort((a, b) => b[1] - a[1]),
		},
	};
}

const CORPUS = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';

if (process.argv[1]?.endsWith('extract.ts')) {
	const { report } = extractAll(CORPUS);
	console.log(`gabarits entièrement résolus : ${report.resolved}/${report.total}`);
	console.log(`champs rejetés : ${report.rejected.length}`);
	console.log('\nnoms manquants, par nombre de gabarits bloqués :');
	for (const [name, count] of report.missingByName.slice(0, 25)) {
		console.log(`  ${String(count).padStart(4)}  ${name}`);
	}
}
