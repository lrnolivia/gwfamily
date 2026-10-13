export function deviceOS(ua=''){return /Android/i.test(ua)?'android':/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)?'apple':'other'}
export function initialMaterial(saved,ua=''){return ['ios','android'].includes(saved)?saved:deviceOS(ua)==='apple'?'ios':'android'}

export function initialTheme(saved,prefersDark=false){return ['light','dark'].includes(saved)?saved:prefersDark?'dark':'light';}
