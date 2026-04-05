import { nextCosmosStaticParams } from 'react-cosmos-next';
import * as cosmosImports from '../../../../cosmos.imports';
import { CosmosFixtureLoader } from './CosmosFixtureLoader';

export const generateStaticParams = nextCosmosStaticParams(cosmosImports);

export default async function CosmosPage(props: { params: Promise<{ fixture: string }> }) {
	const { fixture } = await props.params;
	return <CosmosFixtureLoader fixture={fixture} />;
}
