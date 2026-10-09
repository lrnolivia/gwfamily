export function approvalPosting(currentStatus,nextStatus,currentPermission){return currentStatus==='pending'&&nextStatus==='active'?true:Boolean(currentPermission)}
