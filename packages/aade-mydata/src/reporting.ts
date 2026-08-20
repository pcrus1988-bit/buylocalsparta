import { childElements, childText, descendants, parseXmlDocument, textContent } from "./xml.ts";

export type MyDataContinuationToken = Readonly<{
  nextPartitionKey?: string;
  nextRowKey?: string;
}>;

export type MyDataVatInfoRecord = Readonly<{
  mark?: string;
  cancelled: boolean;
  issueDate?: string;
  amounts: Readonly<Record<string, number>>;
  fields: Readonly<Record<string, string>>;
}>;

export type MyDataVatInfoResponse = Readonly<{
  records: readonly MyDataVatInfoRecord[];
  continuation?: MyDataContinuationToken;
  rawXml: string;
}>;

export type MyDataE3InfoRecord = Readonly<{
  vatNumber?: string;
  mark?: string;
  issueDate?: string;
  classificationCategory?: string;
  classificationType?: string;
  classificationValue?: number;
  fields: Readonly<Record<string, string>>;
}>;

export type MyDataE3InfoResponse = Readonly<{
  records: readonly MyDataE3InfoRecord[];
  continuation?: MyDataContinuationToken;
  rawXml: string;
}>;

export function parseVatInfoResponse(xml:string):MyDataVatInfoResponse{
  const root=parseXmlDocument(xml);
  const records=descendants(root,"VatInfo").map(node=>{
    const fields=fieldMap(node);
    const amounts:Record<string,number>={};
    for(const [name,value] of Object.entries(fields)){
      if(name==="Mark"||name==="IsCancelled"||name==="IssueDate")continue;
      const number=decimal(value);if(number!==undefined)amounts[name]=number;
    }
    return{
      mark:optional(fields.Mark),
      cancelled:booleanValue(fields.IsCancelled),
      issueDate:optional(fields.IssueDate),
      amounts,
      fields
    };
  });
  return{records,continuation:continuation(root),rawXml:xml};
}

export function parseE3InfoResponse(xml:string):MyDataE3InfoResponse{
  const root=parseXmlDocument(xml);
  const records=descendants(root,"E3Info").map(node=>{
    const fields=fieldMap(node);
    return{
      vatNumber:optional(fields.V_Afm),
      mark:optional(fields.V_Mark),
      issueDate:optional(fields.IssueDate),
      classificationCategory:optional(fields.V_Class_Category),
      classificationType:optional(fields.V_Class_Type),
      classificationValue:decimal(fields.V_Class_Value),
      fields
    };
  });
  return{records,continuation:continuation(root),rawXml:xml};
}

function continuation(root:ReturnType<typeof parseXmlDocument>):MyDataContinuationToken|undefined{
  const token=descendants(root,"continuationToken")[0];
  if(!token)return undefined;
  const nextPartitionKey=optional(childText(token,"nextPartitionKey"));
  const nextRowKey=optional(childText(token,"nextRowKey"));
  return nextPartitionKey||nextRowKey?{nextPartitionKey,nextRowKey}:undefined;
}

function fieldMap(node:ReturnType<typeof parseXmlDocument>):Readonly<Record<string,string>>{
  const fields:Record<string,string>={};
  for(const child of childElementsFromNode(node)){
    const value=textContent(child).trim();
    if(value)fields[child.localName]=value;
  }
  return fields;
}
function childElementsFromNode(node:ReturnType<typeof parseXmlDocument>){return node.children;}
function optional(value:string|undefined):string|undefined{return value?.trim()||undefined;}
function decimal(value:string|undefined):number|undefined{
  if(!value?.trim()||!^-?\d+(?:\.\d+)?$/.test(value.trim()))return undefined;
  const parsed=Number(value);return Number.isFinite(parsed)?parsed:undefined;
}
function booleanValue(value:string|undefined):boolean{return /^(?:true|1)$/i.test(value?.trim()??"");}
