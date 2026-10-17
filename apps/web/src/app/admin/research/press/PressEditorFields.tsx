"use client";

import { useMemo, useState } from "react";
import { pressPreviewHtml } from "../../../../lib/research-press-template";
import { parsePressCsv, type PressCsvResult, type PressLanguage } from "../../../../lib/research-press-csv";

type RecipientList = {
  id:string; name:string; recipients:readonly string[];
  recipient_languages:Readonly<Record<string,PressLanguage>>;
};
type PreviewState = { result:PressCsvResult|null; error:string; filename:string };
const emptyPreview:PreviewState = { result:null,error:"",filename:"" };

export function PressEditorFields(props: Readonly<{
  title:string; subject:string; subjectEn?:string|null; bodyHtml:string; bodyHtmlEn?:string|null;
  recipients:readonly string[]; recipientLanguages:Readonly<Record<string,PressLanguage>>;
  attachmentName?:string|null; attachmentNameEn?:string|null;
  lists:readonly RecipientList[]; editable:boolean;
}>) {
  const [title,setTitle]=useState(props.title);
  const [subject,setSubject]=useState(props.subject);
  const [subjectEn,setSubjectEn]=useState(props.subjectEn??"");
  const [html,setHtml]=useState(props.bodyHtml);
  const [htmlEn,setHtmlEn]=useState(props.bodyHtmlEn??"");
  const [lang,setLang]=useState<PressLanguage>("el");
  const [csvPreview,setCsvPreview]=useState<PreviewState>(emptyPreview);
  const [selectedList,setSelectedList]=useState("");
  const [mode,setMode]=useState<"append"|"replace">("replace");
  const [mobile,setMobile]=useState(false);
  const [previewOpen,setPreviewOpen]=useState(true);
  const [clearAttachment,setClearAttachment]=useState(false);
  const [clearAttachmentEn,setClearAttachmentEn]=useState(false);
  const existing=useMemo(()=>{
    const el=props.recipients.filter(email=>props.recipientLanguages[email]==="el").length;
    const en=props.recipients.filter(email=>props.recipientLanguages[email]==="en").length;
    return {el,en};
  },[props.recipients,props.recipientLanguages]);
  const activeBody=lang==="el"?html:htmlEn;
  const preview=useMemo(()=>{
    try { return {html:pressPreviewHtml(activeBody,lang),error:""}; }
    catch(error) { return {html:"",error:error instanceof Error?error.message:"Invalid HTML"}; }
  },[activeBody,lang]);

  const selected=props.lists.find(l=>l.id===selectedList);
  const newCounts=csvPreview.result?.counts || (selected ? {
    el:selected.recipients.filter(a=>selected.recipient_languages[a]==="el").length,
    en:selected.recipients.filter(a=>selected.recipient_languages[a]==="en").length
  } : null);
  const activeAttachmentName=lang==="el"?props.attachmentName:props.attachmentNameEn;
  const changeCsv=async(file:File|undefined)=>{
    if(!file){setCsvPreview(emptyPreview);return;}
    setSelectedList("");
    if(!file.name.toLowerCase().endsWith(".csv") || file.size>1024*1024) {
      setCsvPreview({result:null,error:"Upload a UTF-8 .csv file, maximum 1 MB.",filename:file.name});return;
    }
    try{setCsvPreview({result:parsePressCsv(await file.text()),error:"",filename:file.name});}
    catch(error){setCsvPreview({result:null,error:error instanceof Error?error.message:"CSV could not be read.",filename:file.name});}
  };
  const editable=props.editable;

  return <div className="press-editor">
    <div className="press-field">
      <label htmlFor="press-title">Release title · internal campaign name</label>
      <input id="press-title" name="title" value={title} onChange={e=>setTitle(e.target.value)}
        maxLength={240} required disabled={!editable} placeholder="Ελληνικό Λιανεμπόριο 2026 — Interim Release"/>
    </div>

    <section className="press-card press-bilingual">
      <div className="press-panel-head"><div><strong>Language versions · Περιεχόμενο</strong>
        <small>Two independent subject lines, HTML messages and attached documents. Content is never machine translated at send time.</small>
      </div></div>
      <div className="press-language-switch" role="group" aria-label="Edit press release language">
        <button type="button" className={lang==="el"?"is-active":""} aria-pressed={lang==="el"} onClick={()=>setLang("el")}>🇬🇷 Ελληνικά · EL</button>
        <button type="button" className={lang==="en"?"is-active":""} aria-pressed={lang==="en"} onClick={()=>setLang("en")}>🇬🇧 English · EN</button>
      </div>
      <div className="press-hidden-data" hidden={lang!=="el"}>
        <div className="press-field"><label htmlFor="press-subject">Greek email subject</label>
          <input id="press-subject" name="subject" value={subject} onChange={e=>setSubject(e.target.value)}
            maxLength={240} required disabled={!editable} placeholder="ΔΕΛΤΙΟ ΤΥΠΟΥ | KONTA MOY"/>
        </div>
        <div className="press-field"><label htmlFor="press-html">Greek HTML body</label>
          <textarea id="press-html" name="bodyHtml" rows={17} maxLength={120000} required spellCheck={false}
            value={html} onChange={e=>setHtml(e.target.value)} disabled={!editable}
            placeholder={'<h2>Δελτίο Τύπου</h2>\n<p>Κείμενο στα ελληνικά…</p>'}/>
        </div>
      </div>
      <div className="press-hidden-data" hidden={lang!=="en"}>
        <div className="press-field"><label htmlFor="press-subject-en">English email subject</label>
          <input id="press-subject-en" name="subjectEn" value={subjectEn} onChange={e=>setSubjectEn(e.target.value)}
            maxLength={240} disabled={!editable} placeholder="PRESS RELEASE | KONTA MOY"/>
        </div>
        <div className="press-field"><label htmlFor="press-html-en">English HTML body</label>
          <textarea id="press-html-en" name="bodyHtmlEn" rows={17} maxLength={120000} spellCheck={false}
            value={htmlEn} onChange={e=>setHtmlEn(e.target.value)} disabled={!editable}
            placeholder={'<h2>Press Release</h2>\n<p>English-language announcement…</p>'}/>
        </div>
      </div>
      <p className="press-help">The branded header and full localized footer are applied automatically. Only HTML fragments are permitted.</p>
    </section>

    <div className="press-edit-grid">
      <section className="press-card press-preview">
        <div className="press-panel-head"><div><strong>{lang==="el"?"Greek":"English"} live email preview</strong><small>Header + message + localized footer</small></div>
          <div className="press-preview-buttons">
            <button type="button" onClick={()=>setMobile(!mobile)}>{mobile?"Desktop":"Mobile"}</button>
            <button type="button" onClick={()=>setPreviewOpen(!previewOpen)} aria-expanded={previewOpen}>{previewOpen?"Hide":"Show"}</button>
          </div>
        </div>
        {previewOpen && (preview.error
          ? <p role="alert" className="press-alert press-alert-error">{preview.error}</p>
          : <iframe className={mobile?"press-preview-frame press-is-mobile":"press-preview-frame"}
              title={lang==="el"?"Greek email preview":"English email preview"} srcDoc={preview.html} sandbox="" referrerPolicy="no-referrer"/>)}
      </section>
      <section className="press-card">
        <div className="press-panel-head"><div><strong>Language-specific attachments</strong><small>Attach the Greek PDF to EL and English PDF to EN.</small></div></div>
        <div className="press-field"><label htmlFor="press-attachment">🇬🇷 Greek attachment</label>
          {props.attachmentName && <small>Currently: {props.attachmentName}</small>}
          {editable && <input id="press-attachment" name="attachment" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg"/>}
          {editable && props.attachmentName && <label className="press-check"><input type="checkbox" checked={clearAttachment} onChange={e=>setClearAttachment(e.target.checked)}/> Remove existing Greek attachment</label>}
          {clearAttachment && <input type="hidden" name="clearAttachment" value="yes"/>}
        </div>
        <div className="press-field"><label htmlFor="press-attachment-en">🇬🇧 English attachment</label>
          {props.attachmentNameEn && <small>Currently: {props.attachmentNameEn}</small>}
          {editable && <input id="press-attachment-en" name="attachmentEn" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg"/>}
          {editable && props.attachmentNameEn && <label className="press-check"><input type="checkbox" checked={clearAttachmentEn} onChange={e=>setClearAttachmentEn(e.target.checked)}/> Remove existing English attachment</label>}
          {clearAttachmentEn && <input type="hidden" name="clearAttachmentEn" value="yes"/>}
        </div>
        <p className="press-help">PDF, DOCX, PNG or JPG, max 3 MB per language. If any attachment is used, every targeted language must have its own file before preparing.</p>
        <div className="press-identity"><strong>From</strong><span>research@kontamou.site</span><small>One email per recipient; contacts never see the complete list.</small></div>
      </section>
    </div>

    <section className="press-card">
      <div className="press-panel-head"><div><strong>Recipient language mapping · CSV</strong><small>Every contact must declare its language. No inference from country or domain.</small></div></div>
      <div className="press-csv-sample"><code>email,language,outlet,name</code><code>editor@greek-example.gr,el,Greek Business News,Newsroom</code><code>press@europe-example.eu,en,European Business News,Editor</code></div>
      <div className="press-recipient-stats">
        <div><span>Currently saved</span><strong>{props.recipients.length}</strong></div>
        <div><span>🇬🇷 Greek</span><strong>{existing.el}</strong></div>
        <div><span>🇬🇧 English</span><strong>{existing.en}</strong></div>
      </div>
      {editable && <>
        <div className="press-form-grid">
          <div className="press-field">
            <label htmlFor="press-csv">Import new UTF-8 CSV (email, language)</label>
            <input id="press-csv" name="recipientCsv" type="file" accept=".csv,text/csv"
              onChange={e=>void changeCsv(e.target.files?.[0])}/>
          </div>
          <div className="press-field">
            <label htmlFor="press-select-list">Or use previously saved distribution list</label>
            <select id="press-select-list" name="selectedListId" value={selectedList}
              onChange={e=>setSelectedList(e.target.value)} disabled={Boolean(csvPreview.filename)}>
              <option value="">Choose list…</option>
              {props.lists.map(l=><option key={l.id} value={l.id}>{l.name} ({l.recipients.length})</option>)}
            </select>
          </div>
        </div>
        <div className="press-field press-import-mode"><label htmlFor="press-import-mode">Import behavior</label>
          <select id="press-import-mode" name="importMode" value={mode} onChange={e=>setMode(e.target.value==="append"?"append":"replace")}>
            <option value="replace">Replace saved recipients with imported contacts</option>
            <option value="append">Add contacts to existing recipients (fail on language conflicts)</option>
          </select>
        </div>
      </>}
      {csvPreview.error && <p className="press-alert press-alert-error" role="alert">{csvPreview.error}</p>}
      {newCounts && <div className="press-csv-preview" role="status">
        <strong>Import preview — {csvPreview.result?.contacts.length??selected?.recipients.length} unique</strong>
        <span>🇬🇷 {newCounts.el} Greek · 🇬🇧 {newCounts.en} English</span>
        {csvPreview.result?.duplicateCount ? <span>{csvPreview.result.duplicateCount} same-language duplicates ignored</span>:null}
        <small>Review and Save to persist. Any invalid or ambiguous CSV row blocks the entire import.</small>
        {csvPreview.result && <div className="press-delivery-table-wrap"><table>
          <thead><tr><th>Email</th><th>Language</th><th>Outlet</th></tr></thead>
          <tbody>{csvPreview.result.contacts.slice(0,10).map(item=><tr key={item.email}>
            <td>{item.email}</td><td>{item.language==="el"?"Greek":"English"}</td><td>{item.outlet||"—"}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>}
      {!editable && <p className="press-help">Contact addresses are locked for this release.</p>}
      <p className="press-help">Accepted values for language: el/en or Greek/English. Supports comma- or semicolon-separated CSV, quoted fields and UTF-8 BOM. Limit 500 contacts per release.</p>
    </section>

    {editable && <div className="press-save-row"><button className="button" type="submit" disabled={Boolean(csvPreview.error)}>Save press release draft</button><small>Saving never sends any email.</small></div>}
  </div>;
}
