// Provider-owned complete button artwork, byte-identical to original downloads.
// No asset is fetched from a third party at runtime; paths deploy from dist/.
const assets = {
  "google-dark": {
    "path": "/brand/sign-in/google-dark.1c8c1b947274.png",
    "sha256": "1c8c1b94727499d5e8d98a86199819f5c1e711b15b805d53a9f85aa308940656",
    "bytes": 14615,
    "provider": "google",
    "theme": "dark",
    "source_url": "https://developers.google.com/static/identity/images/signin-assets.zip",
    "archive_entry": "Android + Web/PNG @4x/Dark/Theme=Dark, Show text=Yes, Shape=Square, Platform=Android+Web@4x.png"
  },
  "google-light": {
    "path": "/brand/sign-in/google-light.e048546f162b.png",
    "sha256": "e048546f162b43a5f3809796f88df02a8e13f07ca1280a9c1635018956e05c05",
    "bytes": 13848,
    "provider": "google",
    "theme": "light",
    "source_url": "https://developers.google.com/static/identity/images/signin-assets.zip",
    "archive_entry": "Android + Web/PNG @4x/Light/Theme=Light, Show text=Yes, Shape=Square, Platform=Android+Web@4x.png"
  },
  "microsoft-dark": {
    "path": "/brand/sign-in/microsoft-dark.3f7dfc3df9b5.svg",
    "sha256": "3f7dfc3df9b510da57a925cf1ece829545fc11a3d30e75a07b3accf55d3b7755",
    "bytes": 7414,
    "provider": "microsoft",
    "theme": "dark",
    "source_url": "https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_signin_dark.svg"
  },
  "microsoft-light": {
    "path": "/brand/sign-in/microsoft-light.e06fb6b9c489.svg",
    "sha256": "e06fb6b9c489d5719260945b5b9108f12fedd77e61206229f5fdd77a060e77a8",
    "bytes": 7552,
    "provider": "microsoft",
    "theme": "light",
    "source_url": "https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_signin_light.svg"
  },
  "yahoo-dark": {
    "path": "/brand/sign-in/yahoo-dark.7ae7e34e1e7e.png",
    "sha256": "7ae7e34e1e7e0a3c4818b270da222eef747bd71e087275ede8df2b31430b7cf5",
    "bytes": 6794,
    "provider": "yahoo",
    "theme": "dark",
    "source_url": "https://s.yimg.com/oo/sign-in-with-yahoo/d2a215759cadc2422a6a5d79e4f822e8798e2f35/YLoginButtonRectanglePrimary.zip",
    "archive_entry": "Rectangle Primary (dark).png"
  },
  "yahoo-light": {
    "path": "/brand/sign-in/yahoo-light.7ba1bcc8f0a1.png",
    "sha256": "7ba1bcc8f0a11f3e29fa1c8d03185b27f49f3b12265f34571d642a488cd55cd7",
    "bytes": 8233,
    "provider": "yahoo",
    "theme": "light",
    "source_url": "https://s.yimg.com/oo/sign-in-with-yahoo/d2a215759cadc2422a6a5d79e4f822e8798e2f35/YLoginButtonRectanglePrimary.zip",
    "archive_entry": "Rectangle Primary.png"
  }
};
const brands = Object.freeze({
 google: Object.freeze({id:'google',label:'Sign in with Google',width:720,height:160,light:assets['google-light'].path,dark:assets['google-dark'].path}),
 microsoft: Object.freeze({id:'microsoft',label:'Sign in with Microsoft',width:215,height:41,light:assets['microsoft-light'].path,dark:assets['microsoft-dark'].path}),
 yahoo: Object.freeze({id:'yahoo',label:'Sign in with Yahoo',width:414,height:86,light:assets['yahoo-light'].path,dark:assets['yahoo-dark'].path}),
});
export function officialProviderBrand(provider){
 return typeof provider==='string'&&Object.hasOwn(brands,provider)?brands[provider]:null;
}
export function officialProviderBrandReady(provider){return !!officialProviderBrand(provider);}
export function officialProviderBrandStatus(){
 return ['google','microsoft','yahoo'].map(id=>({id,ready:officialProviderBrandReady(id)}));
}
export function providerButtonState(provider,{disabled=false,busy=false}={}){
 const brand=officialProviderBrand(provider);
 return brand?{...brand,disabled:!!disabled||!!busy,busy:!!busy}:null;
}
