# Profile music and social connections

## Catalog source and limits

The music picker requests the public iTunes Search API directly, with an explicit Search action (no request per keystroke), a limit of eight songs, a 9-second timeout, abort-on-change, and a bounded ten-minute in-memory cache. No user account, subscription, secret, or API credential is required for this catalog request. A live request on 2026-10-06 returned HTTP 200, JSON song metadata and artwork, and Access-Control-Allow-Origin: *. Current documentation: https://performance-partners.apple.com/search-api.

Saved data remains the existing themeSong URL and named socials URL map. Reopening the editor resolves an Apple track's title and artwork using the same public lookup endpoint; unavailable metadata preserves the saved song link. Spotify is an explicit external-search-and-paste workflow. It does not promise internal Spotify catalog search or cross-service matching. No Songlink/Odesli request is used. Song playback remains opt-in.

## Apple badge

The unmodified SVG in dist/profile-assets/itunes-store-badge.svg is Apple's official “Get it on iTunes Store” badge, extracted from:
https://www.apple.com/105/media/us/ipoditunes/itunes/2018/3a5387c5_1ebd_4993_9633_ff7264dc27bf/itunes-store-badges/us_uk.zip
Archive path: US_UK/iTunes_Store_Badge/Get_it_on/SVG/US_UK_iTunes_Store_Get_Badge_RGB_012618.svg.
Current guidelines: https://marketing.services.apple/itunes-identity-guidelines.

The badge links directly to the listed recording. Artwork is fetched as supplied and is not cached by the app, downloaded for playback, or used as an unrelated background. Apple Music and iTunes Store are trademarks of Apple Inc., registered in the U.S. and other countries.

## Brand silhouettes

src/profile-brand-icons.jsx contains recognized brand marks, sourced from the Simple Icons SVG distribution, v15.17.0 (Instagram, Facebook, YouTube, TikTok, Bluesky, Spotify and Apple Music) and v11.15.0 (LinkedIn):
https://github.com/simple-icons/simple-icons
https://cdn.jsdelivr.net/npm/simple-icons@15.17.0/icons/
https://cdn.jsdelivr.net/npm/simple-icons@11.15.0/icons/linkedin.svg
Simple Icons is CC0-1.0; brands remain trademarks of their respective owners. These marks identify their services; no endorsement is claimed.

## Verification

The isolated unit tests cover handle-to-URL construction, exact HTTPS host validation, old saved URL round-trips, empty/removable services, query encoding, direct Apple song lookup, saved-song metadata restoration, request caching, invalid results, cancellation, catalog errors, and the paste fallback. Native browser execution was unavailable to this worker by the task's access boundary; visual and live-browser checks are owned by the parent task.
