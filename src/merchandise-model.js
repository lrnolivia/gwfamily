export const standardSizes=['XS','S','M','L','XL','2XL','3XL'];
export function itemVariants(product){return Array.isArray(product.options)?product.options.reduce((rows,g)=>rows.flatMap(row=>g.values.map(v=>[...row,g.name+': '+v])),[[]]).map(row=>row.join(' · ')||'Standard'):standardSizes}
