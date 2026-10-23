export const landingPackages = [
  { name: 'state', title: 'State', en: 'One state. Room for every view.', ko: '하나의 상태, 저마다의 화면.' },
] as const;

export type LandingPackage = (typeof landingPackages)[number];

export function getLandingPackage(name: string) {
  return landingPackages.find(item => item.name === name);
}
