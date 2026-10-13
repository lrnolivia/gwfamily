import React from 'react';
import {createPortal} from 'react-dom';
import './update-toast.css';
export function ToastLayer({children}){return typeof document==='undefined'?null:createPortal(<div className="gw-toast-layer">{children}</div>,document.body)}
