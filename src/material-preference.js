export function deviceOS(ua=''){return /Android/i.test(ua)?'android':/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)?'apple':'other'}
export function initialMaterial(saved,ua=''){return ['ios','android'].includes(saved)?saved:deviceOS(ua)==='android'?'android':'ios'}
