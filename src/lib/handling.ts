/** GTA V CHandlingData fields we expose in the editor. */
export interface HandlingData {
  handlingName: string
  fMass: number
  fInitialDragCoeff: number
  fPercentSubmerged: number
  fCentreOfMassOffsetX: number
  fCentreOfMassOffsetY: number
  fCentreOfMassOffsetZ: number
  fInertiaMultiplierX: number
  fInertiaMultiplierY: number
  fInertiaMultiplierZ: number
  fDriveBiasFront: number
  nInitialDriveGears: number
  fInitialDriveForce: number
  fDriveInertia: number
  fClutchChangeRateScaleUpShift: number
  fClutchChangeRateScaleDownShift: number
  fInitialDriveMaxFlatVel: number
  fBrakeForce: number
  fBrakeBiasFront: number
  fHandBrakeForce: number
  fSteeringLock: number
  fTractionCurveMax: number
  fTractionCurveMin: number
  fTractionCurveLateral: number
  fTractionSpringDeltaMax: number
  fLowSpeedTractionLossMult: number
  fCamberStiffnesss: number
  fTractionBiasFront: number
  fTractionLossMult: number
  fSuspensionForce: number
  fSuspensionCompDamp: number
  fSuspensionReboundDamp: number
  fSuspensionUpperLimit: number
  fSuspensionLowerLimit: number
  fSuspensionRaise: number
  fSuspensionBiasFront: number
  fAntiRollBarForce: number
  fAntiRollBarBiasFront: number
  fRollCentreHeightFront: number
  fRollCentreHeightRear: number
  fCollisionDamageMult: number
  fWeaponDamageMult: number
  fDeformationDamageMult: number
  fEngineDamageMult: number
  fPetrolTankVolume: number
  fOilVolume: number
  fSeatOffsetDistX: number
  fSeatOffsetDistY: number
  fSeatOffsetDistZ: number
  nMonetaryValue: number
  strModelFlags: string
  strHandlingFlags: string
  strDamageFlags: string
  AIHandling: string
}

export type Drivetrain = 'fwd' | 'awd' | 'rwd'
export type HandlingStyle = 'supercar' | 'sports' | 'drift' | 'offroad' | 'muscle' | 'lowrider' | 'track' | 'rally'

export const DEFAULT_HANDLING: HandlingData = {
  handlingName: 'adder',
  fMass: 1800,
  fInitialDragCoeff: 8.0,
  fPercentSubmerged: 85,
  fCentreOfMassOffsetX: 0,
  fCentreOfMassOffsetY: 0,
  fCentreOfMassOffsetZ: 0,
  fInertiaMultiplierX: 1,
  fInertiaMultiplierY: 1.2,
  fInertiaMultiplierZ: 1.4,
  fDriveBiasFront: 0.5,
  nInitialDriveGears: 6,
  fInitialDriveForce: 0.32,
  fDriveInertia: 1,
  fClutchChangeRateScaleUpShift: 2.2,
  fClutchChangeRateScaleDownShift: 2.2,
  fInitialDriveMaxFlatVel: 160,
  fBrakeForce: 1.0,
  fBrakeBiasFront: 0.52,
  fHandBrakeForce: 0.7,
  fSteeringLock: 40,
  fTractionCurveMax: 2.5,
  fTractionCurveMin: 2.2,
  fTractionCurveLateral: 22.5,
  fTractionSpringDeltaMax: 0.15,
  fLowSpeedTractionLossMult: 1.0,
  fCamberStiffnesss: 0,
  fTractionBiasFront: 0.48,
  fTractionLossMult: 1.0,
  fSuspensionForce: 2.2,
  fSuspensionCompDamp: 1.4,
  fSuspensionReboundDamp: 2.2,
  fSuspensionUpperLimit: 0.1,
  fSuspensionLowerLimit: -0.12,
  fSuspensionRaise: 0,
  fSuspensionBiasFront: 0.5,
  fAntiRollBarForce: 0.8,
  fAntiRollBarBiasFront: 0.5,
  fRollCentreHeightFront: 0.3,
  fRollCentreHeightRear: 0.3,
  fCollisionDamageMult: 1,
  fWeaponDamageMult: 1,
  fDeformationDamageMult: 0.8,
  fEngineDamageMult: 1.5,
  fPetrolTankVolume: 65,
  fOilVolume: 5,
  fSeatOffsetDistX: 0,
  fSeatOffsetDistY: -0.1,
  fSeatOffsetDistZ: 0,
  nMonetaryValue: 80000,
  strModelFlags: '440010',
  strHandlingFlags: '0',
  strDamageFlags: '0',
  AIHandling: 'AVERAGE',
}

export function drivetrainOf(h: HandlingData): Drivetrain {
  if (h.fDriveBiasFront >= 0.9) return 'fwd'
  if (h.fDriveBiasFront <= 0.1) return 'rwd'
  return 'awd'
}

export function applyDrivetrain(h: HandlingData, d: Drivetrain): HandlingData {
  const bias = d === 'fwd' ? 1 : d === 'rwd' ? 0 : 0.5
  return { ...h, fDriveBiasFront: bias }
}

const STYLE_PATCH: Record<HandlingStyle, Partial<HandlingData>> = {
  supercar: {
    fInitialDriveForce: 0.42,
    fInitialDriveMaxFlatVel: 180,
    fTractionCurveMax: 2.7,
    fTractionCurveMin: 2.4,
    fBrakeForce: 1.2,
    fSuspensionForce: 2.6,
    fMass: 1600,
  },
  sports: {
    fInitialDriveForce: 0.36,
    fInitialDriveMaxFlatVel: 165,
    fTractionCurveMax: 2.55,
    fBrakeForce: 1.1,
    fSteeringLock: 42,
    fMass: 1500,
  },
  drift: {
    fDriveBiasFront: 0,
    fTractionCurveMax: 1.9,
    fTractionCurveMin: 1.55,
    fLowSpeedTractionLossMult: 1.5,
    fTractionLossMult: 1.3,
    fInitialDriveForce: 0.4,
    fSteeringLock: 55,
    fHandBrakeForce: 1.1,
  },
  offroad: {
    fSuspensionForce: 1.4,
    fSuspensionUpperLimit: 0.2,
    fSuspensionLowerLimit: -0.2,
    fSuspensionRaise: 0.05,
    fTractionLossMult: 0.7,
    fInitialDriveForce: 0.3,
    fMass: 2200,
  },
  muscle: {
    fDriveBiasFront: 0,
    fInitialDriveForce: 0.38,
    fInitialDriveMaxFlatVel: 155,
    fTractionCurveMax: 2.2,
    fMass: 1900,
    fBrakeForce: 0.95,
  },
  lowrider: {
    fSuspensionForce: 1.2,
    fSuspensionRaise: -0.04,
    fInitialDriveMaxFlatVel: 130,
    fInitialDriveForce: 0.26,
    fMass: 2000,
  },
  track: {
    fSuspensionForce: 3.0,
    fAntiRollBarForce: 1.2,
    fTractionCurveMax: 2.8,
    fBrakeForce: 1.35,
    fSteeringLock: 38,
    fInitialDriveForce: 0.4,
  },
  rally: {
    fSuspensionForce: 1.8,
    fTractionLossMult: 0.85,
    fInitialDriveForce: 0.35,
    fSteeringLock: 48,
    fDriveBiasFront: 0.45,
  },
}

export function applyStyle(h: HandlingData, style: HandlingStyle): HandlingData {
  return { ...h, ...STYLE_PATCH[style] }
}

/** Rough in-game estimates for the sidebar. */
export function estimateStats(h: HandlingData) {
  const mph = Math.round(h.fInitialDriveMaxFlatVel * 0.82)
  const drivetrain = drivetrainOf(h)
  return {
    speedMph: mph,
    massKg: Math.round(h.fMass),
    grip: Number(h.fTractionCurveMax.toFixed(2)),
    brakes: Number(h.fBrakeForce.toFixed(2)),
    gears: h.nInitialDriveGears,
    drivetrain: drivetrain === 'fwd' ? 'Front Wheel Drive' : drivetrain === 'rwd' ? 'Rear Wheel Drive' : 'All Wheel Drive',
  }
}

function tag(name: string, value: string | number) {
  return `      <${name} value="${value}" />`
}

export function serializeHandling(h: HandlingData): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '',
    '<CHandlingDataMgr>',
    '  <HandlingData>',
    '    <Item type="CHandlingData">',
    tag('handlingName', h.handlingName),
    tag('fMass', h.fMass.toFixed(6)),
    tag('fInitialDragCoeff', h.fInitialDragCoeff.toFixed(6)),
    tag('fPercentSubmerged', h.fPercentSubmerged.toFixed(6)),
    '      <vecCentreOfMassOffset x="' +
      h.fCentreOfMassOffsetX.toFixed(6) +
      '" y="' +
      h.fCentreOfMassOffsetY.toFixed(6) +
      '" z="' +
      h.fCentreOfMassOffsetZ.toFixed(6) +
      '" />',
    '      <vecInertiaMultiplier x="' +
      h.fInertiaMultiplierX.toFixed(6) +
      '" y="' +
      h.fInertiaMultiplierY.toFixed(6) +
      '" z="' +
      h.fInertiaMultiplierZ.toFixed(6) +
      '" />',
    tag('fDriveBiasFront', h.fDriveBiasFront.toFixed(6)),
    tag('nInitialDriveGears', h.nInitialDriveGears),
    tag('fInitialDriveForce', h.fInitialDriveForce.toFixed(6)),
    tag('fDriveInertia', h.fDriveInertia.toFixed(6)),
    tag('fClutchChangeRateScaleUpShift', h.fClutchChangeRateScaleUpShift.toFixed(6)),
    tag('fClutchChangeRateScaleDownShift', h.fClutchChangeRateScaleDownShift.toFixed(6)),
    tag('fInitialDriveMaxFlatVel', h.fInitialDriveMaxFlatVel.toFixed(6)),
    tag('fBrakeForce', h.fBrakeForce.toFixed(6)),
    tag('fBrakeBiasFront', h.fBrakeBiasFront.toFixed(6)),
    tag('fHandBrakeForce', h.fHandBrakeForce.toFixed(6)),
    tag('fSteeringLock', h.fSteeringLock.toFixed(6)),
    tag('fTractionCurveMax', h.fTractionCurveMax.toFixed(6)),
    tag('fTractionCurveMin', h.fTractionCurveMin.toFixed(6)),
    tag('fTractionCurveLateral', h.fTractionCurveLateral.toFixed(6)),
    tag('fTractionSpringDeltaMax', h.fTractionSpringDeltaMax.toFixed(6)),
    tag('fLowSpeedTractionLossMult', h.fLowSpeedTractionLossMult.toFixed(6)),
    tag('fCamberStiffnesss', h.fCamberStiffnesss.toFixed(6)),
    tag('fTractionBiasFront', h.fTractionBiasFront.toFixed(6)),
    tag('fTractionLossMult', h.fTractionLossMult.toFixed(6)),
    tag('fSuspensionForce', h.fSuspensionForce.toFixed(6)),
    tag('fSuspensionCompDamp', h.fSuspensionCompDamp.toFixed(6)),
    tag('fSuspensionReboundDamp', h.fSuspensionReboundDamp.toFixed(6)),
    tag('fSuspensionUpperLimit', h.fSuspensionUpperLimit.toFixed(6)),
    tag('fSuspensionLowerLimit', h.fSuspensionLowerLimit.toFixed(6)),
    tag('fSuspensionRaise', h.fSuspensionRaise.toFixed(6)),
    tag('fSuspensionBiasFront', h.fSuspensionBiasFront.toFixed(6)),
    tag('fAntiRollBarForce', h.fAntiRollBarForce.toFixed(6)),
    tag('fAntiRollBarBiasFront', h.fAntiRollBarBiasFront.toFixed(6)),
    tag('fRollCentreHeightFront', h.fRollCentreHeightFront.toFixed(6)),
    tag('fRollCentreHeightRear', h.fRollCentreHeightRear.toFixed(6)),
    tag('fCollisionDamageMult', h.fCollisionDamageMult.toFixed(6)),
    tag('fWeaponDamageMult', h.fWeaponDamageMult.toFixed(6)),
    tag('fDeformationDamageMult', h.fDeformationDamageMult.toFixed(6)),
    tag('fEngineDamageMult', h.fEngineDamageMult.toFixed(6)),
    tag('fPetrolTankVolume', h.fPetrolTankVolume.toFixed(6)),
    tag('fOilVolume', h.fOilVolume.toFixed(6)),
    tag('fSeatOffsetDistX', h.fSeatOffsetDistX.toFixed(6)),
    tag('fSeatOffsetDistY', h.fSeatOffsetDistY.toFixed(6)),
    tag('fSeatOffsetDistZ', h.fSeatOffsetDistZ.toFixed(6)),
    tag('nMonetaryValue', h.nMonetaryValue),
    tag('strModelFlags', h.strModelFlags),
    tag('strHandlingFlags', h.strHandlingFlags),
    tag('strDamageFlags', h.strDamageFlags),
    `      <AIHandling>${h.AIHandling}</AIHandling>`,
    '      <SubHandlingData>',
    '        <Item type="NULL" />',
    '        <Item type="NULL" />',
    '        <Item type="NULL" />',
    '      </SubHandlingData>',
    '    </Item>',
    '  </HandlingData>',
    '</CHandlingDataMgr>',
    '',
  ]
  return lines.join('\n')
}

function attr(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}\\s+value="([^"]*)"`, 'i')
  const m = re.exec(xml)
  return m ? m[1] : null
}

function num(xml: string, tagName: string, fallback: number) {
  const v = attr(xml, tagName)
  if (v == null) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function vec(xml: string, tagName: string): [number, number, number] | null {
  const re = new RegExp(`<${tagName}\\s+[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*z="([^"]*)"`, 'i')
  const m = re.exec(xml)
  if (!m) return null
  return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0]
}

/** Parses the first CHandlingData item from a handling.meta XML string. */
export function parseHandling(xml: string): HandlingData {
  const base = { ...DEFAULT_HANDLING }
  const name = attr(xml, 'handlingName') ?? /<handlingName[^>]*>([^<]+)</i.exec(xml)?.[1]?.trim()
  if (name) base.handlingName = name
  base.fMass = num(xml, 'fMass', base.fMass)
  base.fInitialDragCoeff = num(xml, 'fInitialDragCoeff', base.fInitialDragCoeff)
  base.fPercentSubmerged = num(xml, 'fPercentSubmerged', base.fPercentSubmerged)
  const com = vec(xml, 'vecCentreOfMassOffset')
  if (com) {
    base.fCentreOfMassOffsetX = com[0]
    base.fCentreOfMassOffsetY = com[1]
    base.fCentreOfMassOffsetZ = com[2]
  }
  const iner = vec(xml, 'vecInertiaMultiplier')
  if (iner) {
    base.fInertiaMultiplierX = iner[0]
    base.fInertiaMultiplierY = iner[1]
    base.fInertiaMultiplierZ = iner[2]
  }
  base.fDriveBiasFront = num(xml, 'fDriveBiasFront', base.fDriveBiasFront)
  base.nInitialDriveGears = Math.round(num(xml, 'nInitialDriveGears', base.nInitialDriveGears))
  base.fInitialDriveForce = num(xml, 'fInitialDriveForce', base.fInitialDriveForce)
  base.fDriveInertia = num(xml, 'fDriveInertia', base.fDriveInertia)
  base.fClutchChangeRateScaleUpShift = num(xml, 'fClutchChangeRateScaleUpShift', base.fClutchChangeRateScaleUpShift)
  base.fClutchChangeRateScaleDownShift = num(xml, 'fClutchChangeRateScaleDownShift', base.fClutchChangeRateScaleDownShift)
  base.fInitialDriveMaxFlatVel = num(xml, 'fInitialDriveMaxFlatVel', base.fInitialDriveMaxFlatVel)
  base.fBrakeForce = num(xml, 'fBrakeForce', base.fBrakeForce)
  base.fBrakeBiasFront = num(xml, 'fBrakeBiasFront', base.fBrakeBiasFront)
  base.fHandBrakeForce = num(xml, 'fHandBrakeForce', base.fHandBrakeForce)
  base.fSteeringLock = num(xml, 'fSteeringLock', base.fSteeringLock)
  base.fTractionCurveMax = num(xml, 'fTractionCurveMax', base.fTractionCurveMax)
  base.fTractionCurveMin = num(xml, 'fTractionCurveMin', base.fTractionCurveMin)
  base.fTractionCurveLateral = num(xml, 'fTractionCurveLateral', base.fTractionCurveLateral)
  base.fTractionSpringDeltaMax = num(xml, 'fTractionSpringDeltaMax', base.fTractionSpringDeltaMax)
  base.fLowSpeedTractionLossMult = num(xml, 'fLowSpeedTractionLossMult', base.fLowSpeedTractionLossMult)
  base.fCamberStiffnesss = num(xml, 'fCamberStiffnesss', base.fCamberStiffnesss)
  base.fTractionBiasFront = num(xml, 'fTractionBiasFront', base.fTractionBiasFront)
  base.fTractionLossMult = num(xml, 'fTractionLossMult', base.fTractionLossMult)
  base.fSuspensionForce = num(xml, 'fSuspensionForce', base.fSuspensionForce)
  base.fSuspensionCompDamp = num(xml, 'fSuspensionCompDamp', base.fSuspensionCompDamp)
  base.fSuspensionReboundDamp = num(xml, 'fSuspensionReboundDamp', base.fSuspensionReboundDamp)
  base.fSuspensionUpperLimit = num(xml, 'fSuspensionUpperLimit', base.fSuspensionUpperLimit)
  base.fSuspensionLowerLimit = num(xml, 'fSuspensionLowerLimit', base.fSuspensionLowerLimit)
  base.fSuspensionRaise = num(xml, 'fSuspensionRaise', base.fSuspensionRaise)
  base.fSuspensionBiasFront = num(xml, 'fSuspensionBiasFront', base.fSuspensionBiasFront)
  base.fAntiRollBarForce = num(xml, 'fAntiRollBarForce', base.fAntiRollBarForce)
  base.fAntiRollBarBiasFront = num(xml, 'fAntiRollBarBiasFront', base.fAntiRollBarBiasFront)
  base.fRollCentreHeightFront = num(xml, 'fRollCentreHeightFront', base.fRollCentreHeightFront)
  base.fRollCentreHeightRear = num(xml, 'fRollCentreHeightRear', base.fRollCentreHeightRear)
  base.fCollisionDamageMult = num(xml, 'fCollisionDamageMult', base.fCollisionDamageMult)
  base.fWeaponDamageMult = num(xml, 'fWeaponDamageMult', base.fWeaponDamageMult)
  base.fDeformationDamageMult = num(xml, 'fDeformationDamageMult', base.fDeformationDamageMult)
  base.fEngineDamageMult = num(xml, 'fEngineDamageMult', base.fEngineDamageMult)
  base.fPetrolTankVolume = num(xml, 'fPetrolTankVolume', base.fPetrolTankVolume)
  base.fOilVolume = num(xml, 'fOilVolume', base.fOilVolume)
  base.nMonetaryValue = Math.round(num(xml, 'nMonetaryValue', base.nMonetaryValue))
  base.strModelFlags = attr(xml, 'strModelFlags') ?? base.strModelFlags
  base.strHandlingFlags = attr(xml, 'strHandlingFlags') ?? base.strHandlingFlags
  base.strDamageFlags = attr(xml, 'strDamageFlags') ?? base.strDamageFlags
  const ai = /<AIHandling>([^<]+)<\/AIHandling>/i.exec(xml)
  if (ai) base.AIHandling = ai[1].trim()
  return base
}

export const VEHICLE_PRESETS: { id: string; name: string; patch: Partial<HandlingData> }[] = [
  { id: 'adder', name: 'Adder', patch: { handlingName: 'adder', fMass: 1800, fInitialDriveMaxFlatVel: 160, fDriveBiasFront: 0.5 } },
  { id: 'sultan', name: 'Sultan', patch: { handlingName: 'sultan', fMass: 1400, fInitialDriveMaxFlatVel: 145, fDriveBiasFront: 0.5, fInitialDriveForce: 0.28 } },
  { id: 'elegy2', name: 'Elegy RH8', patch: { handlingName: 'elegy2', fMass: 1500, fInitialDriveMaxFlatVel: 150, fDriveBiasFront: 0.5 } },
  { id: 'dominator', name: 'Dominator', patch: { handlingName: 'dominator', fMass: 1700, fDriveBiasFront: 0, fInitialDriveForce: 0.34 } },
  { id: 'comet2', name: 'Comet', patch: { handlingName: 'comet2', fMass: 1400, fDriveBiasFront: 0, fInitialDriveMaxFlatVel: 155 } },
  { id: 'sandking', name: 'Sandking', patch: { handlingName: 'sandking', fMass: 2400, fDriveBiasFront: 0.4, fSuspensionRaise: 0.06, fInitialDriveMaxFlatVel: 120 } },
]

export const STYLE_OPTIONS: { id: HandlingStyle; label: string; hint: string }[] = [
  { id: 'supercar', label: 'Supercar', hint: 'Top speed & grip' },
  { id: 'sports', label: 'Sports', hint: 'Fast and sharp' },
  { id: 'drift', label: 'Drift', hint: 'Easy slides' },
  { id: 'offroad', label: 'Off-road', hint: 'Soft suspension' },
  { id: 'muscle', label: 'Muscle', hint: 'Raw power, RWD' },
  { id: 'lowrider', label: 'Lowrider', hint: 'Low and slow' },
  { id: 'track', label: 'Track', hint: 'Stiff, precise' },
  { id: 'rally', label: 'Rally', hint: 'Loose and fast' },
]

/** Scale basic slider % (50–150) onto a field around its baseline. */
export function scaleField(base: number, percent: number) {
  return base * (percent / 100)
}
