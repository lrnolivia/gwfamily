# grnwht

A gathering place for the Green & White family. Catch up with one another, keep family details together, and make plans for the next reunion.

## Come on in

Start with the invitation link your family shared with you. Follow the sign-in and membership steps to join. If you don't have an invitation yet, ask a family organizer for one.

Once you're in, explore the family feed, find your people, and add your household details. You can use the app on your phone, tablet, or computer.

## A little of everything, together

- **Family updates:** share posts and photos, join conversations, and keep up with what's happening.
- **People and households:** find family members and keep household and profile information together.
- **Reunion plans:** check event information, calendars, and the details your organizers share.
- **Invitations:** help the rest of the family find their way in.
- **Make it comfortable:** choose the appearance you like and manage your notification preferences.

Some features depend on your role, device, and the version currently available to your family.

## Contributions

When organizers provide payment links, contributions go directly to the designated treasurer. grnwht does not hold money. The treasurer confirms receipt; opening a payment link or marking a contribution sent isn't a receipt.

## Work on the app

This repository contains the web app and its backend.

```sh
npm ci
npm test
npm run build
```

The build writes web assets to `dist/`. Serve that directory over HTTP for a frontend preview. Sign-in, saved family data, media, and notifications use the configured backend; see [`backend/`](backend/).

## Credits

Sample photography is identified separately from real family photos. See [photo credits](docs/PHOTO_CREDITS.md).
