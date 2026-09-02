# Timeplan

S-diagram med timeføring for prosjektoppgave i teknisk kybernetikk ved NTNU
(7,5 studiepoeng, høsten 2026).

Planlagt innsats vises som en S-kurve, førte timer som en målt kurve, og
differansen mellom dem som et avvik. 

Publisert på <https://kjethom.github.io/timeplan/>

## Funksjonalitet

- S-kurve generert fra startdato, frist og timebudsjett, med justerbart
  tyngdepunkt og bratthet
- Timeføring per uke, med sammenlikning mot planen
- Én temalinje per uke, og markering av milepæler som kan vises på plankurven
- Nøkkeltall: ført, plan til i dag, avvik, gjenstående, og nødvendig snitt
  per uke for å komme i mål
- CSV-eksport
- Valgfri sikkerhetskopi til en privat GitHub Gist

## Oppsett

Krever Node 22 eller nyere.

```bash
npm install
npm run dev
```

Bygg for produksjon med `npm run build`.

## Publisering

`.github/workflows/deploy.yml` bygger og publiserer til GitHub Pages ved hver
push til `main`. Pages må være satt til **Settings → Pages → Source: GitHub
Actions**.

Repoet må hete det samme som `REPO_NAVN` øverst i `vite.config.js`, siden
Pages serverer siden fra en undermappe. Stemmer ikke navnet, laster ikke CSS
og JavaScript, og du får en blank side.

## Lagring

Timene ligger i nettleserens `localStorage`. De havner aldri i repoet, så
dette kan trygt være offentlig.

Det betyr også at data er knyttet til én nettleser på én maskin. Tømmer du
nettleserdata, forsvinner timene. Safari sletter dessuten data fra nettsteder
du ikke har besøkt på sju dager.

Bruk CSV-eksporten jevnlig, eller slå på sikkerhetskopi for å unngå å miste timeføring.

### Sikkerhetskopi til GitHub Gist (Anbefalt)

Under «Endre oppsett» kan du koble til et personal access token med
`gist`-tilgang. Da lagres hele timeregnskapet i en privat gist i tillegg til
nettleseren.

Tokenet lages under Settings → Developer settings → Personal access tokens →
Tokens (classic). Huk av `gist` og ingenting annet. 

Slik oppfører det seg:

- Ved oppstart letes gisten opp ut fra tokenet, og hentes ned hvis den er
  nyere enn det som ligger lokalt
- Ved endring lagres det lokalt først, og til gisten halvannet sekund senere
- Før hver skriving sjekkes gisten. Er den endret av en annen enhet siden
  denne fanen ble åpnet, stoppes skrivingen og du får velge hvilken versjon
  som skal gjelde

Tokenet ligger i `localStorage` på hver enhet du kobler til. Mister du en av
dem, tilbakekall tokenet på GitHub — det gir tilgang til alle gistene dine,
ikke bare denne.

## Flere enheter

Samme token på flere enheter gir samme gist. Konfliktsjekken hindrer stille
overskriving, men den løser ikke opp i to versjoner for deg - du må velge én.

Last siden på nytt før du fører timer hvis du har brukt en annen enhet siden
sist. Da skriver du oppå riktig grunnlag.

## Teknisk

React 19, Vite, Tailwind CSS 4 og Recharts. Hele appen ligger i
`src/Timeplan.jsx`.

`src/storage.js` finnes fordi komponenten opprinnelig ble laget som et
Claude-artefakt og lagrer via `window.storage`. Modulen gir det samme
grensesnittet på toppen av `localStorage`.

## Lisens

MIT
