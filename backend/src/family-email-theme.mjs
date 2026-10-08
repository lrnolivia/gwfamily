import {profilePalette, contrast} from '../../src/profile-model.js';
import {validHeadingFont} from '../../src/account-actions-model.js';
import {interfaceAccentColor} from '../../src/interface-accent.js';
import {themePreset} from '../../src/theme-presets.js';

// Explicit presentation input only. No account lookup, preference persistence or send path.
export const EMAIL_FONT_ASSETS=Object.freeze({
 sans:{family:'Momo Trust Display',fallback:'Arial,Helvetica,sans-serif',url:'https://fonts.gstatic.com/s/momotrustdisplay/v2/WWXPlieNYgyPZLyBUuEkKZFhFHyjqb1unw.ttf'},
 serif:{family:'DM Serif Text',fallback:'Georgia,Times New Roman,serif',url:'https://fonts.gstatic.com/s/dmseriftext/v13/rnCu-xZa_krGokauCeNq1wWyafM.ttf'},
 body:{family:'Inter',fallback:'Arial,Helvetica,sans-serif',url:'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf'}
});
export function familyEmailTheme(appearance={}){
 const mode=appearance?.theme==='dark'?'dark':'light',font=validHeadingFont(appearance?.headingFont);
 const preference=appearance?.interfaceAccent;
 const choice=preference&&['family','profile','custom'].includes(preference.mode)?interfaceAccentColor(preference,appearance.profileColor):null;
 const preset=themePreset(appearance?.preset)||themePreset(choice)||themePreset('green'),accent=preset.color,palette=profilePalette(accent,mode);
 const wordmark=[palette['--wordmark-green'],palette['--wordmark-white'],palette['--wordmark-family']];
 // Flat email has no app glow/shadow. Keep the selected fill and use readable solid ink (including yellow).
 const button=palette['--control'],buttonInk=contrast(button,'#fffaf0')>=4.5?'#fffaf0':'#171714';
 return Object.freeze({mode,font,preset:preset.id,accent,background:palette['--bg'],surface:palette['--surface'],text:palette['--text'],muted:palette['--muted'],button,buttonInk,wordmark:Object.freeze(wordmark),headingStack:`'${EMAIL_FONT_ASSETS[font].family}',${EMAIL_FONT_ASSETS[font].fallback}`,bodyStack:`'Inter',${EMAIL_FONT_ASSETS.body.fallback}`});
}
