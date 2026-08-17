"use client";
import { useEffect } from "react";
import { useCart } from "./CartProvider";
export function VivaPaymentResultClient({confirmed}:{confirmed:boolean}){const{clear}=useCart();useEffect(()=>{if(confirmed){clear();try{sessionStorage.removeItem("buy-local-sparta-checkout-v1")}catch{}}},[confirmed,clear]);return null;}
