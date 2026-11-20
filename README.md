# Cardkeep

Business card scanner for iPhone and Android. Photograph a card, check the fields, save it to your contacts or export a vCard or CSV. The text is read on the phone, nothing is uploaded, there is no account and no ads.

Built with Expo, React Native, TypeScript and SQLite. The field extraction engine (names, companies, phones, e-mail, addresses, many languages) lives in `src/engine/` and is documented in `src/engine/extract/README.md`.

## Build

```
npm ci
npm run verify
npm run dev
```

The sample cards, names, phone numbers and e-mail addresses in the tests and test flows are made up. Contact details of the provider are read from a local file that is not part of this repository.

## Licence

GPL-3.0-only, see `LICENSE`. Third-party licences are in `LICENSES/`.
