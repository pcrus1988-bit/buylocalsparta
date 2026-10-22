/** Shared transport error; importing payment protocols must not initialize DB clients. */
export class MerchantConnectionError extends Error {
 readonly code:string;readonly status:number;
 constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
