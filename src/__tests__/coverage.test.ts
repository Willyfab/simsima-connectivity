import { allCoveredCodes, resolveCountryCode } from '../lib/coverage';
import type { FeedDestination } from '../types';

function country(slug: string, code: string): FeedDestination {
  return {
    destination: slug,
    pathSlug: `esim-${slug}`,
    url: `https://simsima.io/en/esim/esim-${slug}`,
    countryCode: code,
    bundleType: 'local',
    coverage: [code],
    networks: [],
  };
}

const destinations: FeedDestination[] = [
  country('turkey', 'TR'),
  country('czech-republic', 'CZ'),
  country('hong-kong', 'HK'),
  country('united-states', 'US'),
  country('united-kingdom', 'GB'),
  country('south-korea', 'KR'),
  country('netherlands', 'NL'),
  country('saint-lucia', 'LC'),
  country('bosnia-and-herzegovina', 'BA'),
  country('croatia', 'HR'),
  country('japan', 'JP'),
];
const codes = allCoveredCodes(destinations);
const resolve = (q: string, locale = 'en') => resolveCountryCode(q, codes, locale, destinations);

describe('resolveCountryCode', () => {
  it('reads the usual name where Unicode uses the official one', () => {
    // Unicode dit « Türkiye », « Czechia », « Hong Kong SAR China ».
    expect(resolve('Turkey')).toBe('TR');
    expect(resolve('Czech Republic')).toBe('CZ');
    expect(resolve('Hong Kong')).toBe('HK');
  });

  it('still reads the official name', () => {
    expect(resolve('Türkiye')).toBe('TR');
    expect(resolve('Czechia')).toBe('CZ');
  });

  it('reads short forms and familiar names', () => {
    expect(resolve('UK')).toBe('GB');
    expect(resolve('England')).toBe('GB');
    expect(resolve('USA')).toBe('US');
    expect(resolve('Korea')).toBe('KR');
    expect(resolve('Holland')).toBe('NL');
    expect(resolve('Bosnia')).toBe('BA');
  });

  it('ignores punctuation, "&", "St." and a leading "the"', () => {
    expect(resolve('St. Lucia')).toBe('LC');
    expect(resolve('saint-lucia')).toBe('LC');
    expect(resolve('Bosnia & Herzegovina')).toBe('BA');
    expect(resolve('the Netherlands')).toBe('NL');
  });

  it("reads names in the user's language", () => {
    expect(resolve('Turquie', 'fr')).toBe('TR');
    expect(resolve('Royaume-Uni', 'fr')).toBe('GB');
    expect(resolve('クロアチア', 'ja')).toBe('HR');
  });

  it('accepts an ISO code', () => {
    expect(resolve('tr')).toBe('TR');
  });

  it('never resolves a country the catalog does not cover', () => {
    // « Burma » est un alias connu, mais le Myanmar n'est pas dans ce catalogue.
    expect(resolve('Burma')).toBeNull();
    expect(resolve('France')).toBeNull();
    expect(resolve('Narnia')).toBeNull();
  });
});
