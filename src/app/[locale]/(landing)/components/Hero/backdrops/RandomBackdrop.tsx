'use client';

import { useSyncExternalStore } from 'react';
import { ConstellationBackdrop } from './ConstellationBackdrop';
import { GeometricDoorBackdrop } from './GeometricDoorBackdrop';
import { MandalaBackdrop } from './MandalaBackdrop';
import { CardFanBackdrop } from './CardFanBackdrop';
import { ManaPentagonBackdrop } from './ManaPentagonBackdrop';
import { SunburstBackdrop } from './SunburstBackdrop';

const BACKDROPS = [
	ConstellationBackdrop,
	GeometricDoorBackdrop,
	MandalaBackdrop,
	CardFanBackdrop,
	ManaPentagonBackdrop,
	SunburstBackdrop,
];

const randomIndex = Math.floor(Math.random() * BACKDROPS.length);
const subscribe = () => () => {};
const getSnapshot = () => randomIndex;
const getServerSnapshot = () => 0;

export function RandomBackdrop() {
	const index = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const Backdrop = BACKDROPS[index];
	return <Backdrop />;
}
