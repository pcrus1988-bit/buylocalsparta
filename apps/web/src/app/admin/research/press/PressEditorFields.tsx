"use client";

import { useMemo, useState } from "react";
import { pressPreviewHtml } from "../../../../lib/research-press-template";

type RecipientList = { id: string; name: string; recipients: string[] };
export function PressEditorFields(props: Readonly<{
  title: string; subject: string; bodyHtml: string; recipients: string;
  attachmentName?: string | null; lists: RecipientList[]; editable: boolean;
}>) {
  const [title,setTitle] = useState(props.title);
  const [subject,setSubject] = useState(props.subject);
  const [html,setHtml] = useState(props.bodyHtml);
  const [recipients,setRecipients] = useState(props.recipients);
  const [selectedList,setSelectedList] = useState("");
  const [mobile,setMobile] = useState(false);
  const [previewOpen,setPreviewOpen] = useState(true);
  const [clearAttachment,setClearAttachment] = useState(false);
  const parsed = useMemo(() => {
    const unique = [...new Set(recipients.split(/[;,\n]+/).map(s=>s.trim().toLowerCase()).filter(Boolean))];
    return unique;
  },[recipients]);
  const preview = useMemo(()=>{
    try { return {html:pressPreviewHtml(html),error:""}; }
    catch(error) { return {html:"",error:error instanceof Error?error.message:"Invalid HTML"}; }
  },[html]);

  return <div className="press-editor">
    <div className="press-form-grid">
      <div className="press-field">
        <label htmlFor="press-title">Press release title</label>
        <input id="press-title" name="title" value={title} onChange={e=>setTitle(e.target.value)}
          maxLength={240} required disabled={!props.editable} placeholder="Ελληνικό Λιανεμπόριο 2026 — Πρώτα αποτελέσματα" />
      </div>
      <div className="press-field">
        <label htmlFor="press-subject">Email subject</label>
        <input id="press-subject" name="subject" value={subject} onChange={e=>setSubject(e.target.value)}
          maxLength={240} required disabled={!props.editable} placeholder="ΔΕΛΤΙΟ ΤΥΠΟΥ | KONTA MOY" />
      </div>
    </div>

    <div className="press-edit-grid">
      <section className="press-card press-composer">
        <div className="press-panel-head"><div><strong>HTML body</strong><small>Styled HTML fragment · automatically wrapped in KONTA MOY branding and full press footer</small></div><span>{html.length.toLocaleString("el-GR")} / 120.000</span></div>
        <div className="press-field">
          <textarea id="press-html" name="bodyHtml" spellCheck={false} rows={19} maxLength={120000} required
            value={html} onChange={e=>setHtml(e.target.value)} disabled={!props.editable}
            placeholder={'<h2>Δελτίο Τύπου</h2>\n<p>Το περιεχόμενο της ανακοίνωσης…</p>'}/>
        </div>
        <p className="press-help">Use headings, paragraphs, links, lists and images with HTTPS URLs. Scripts, embedded forms and full HTML documents are blocked.</p>
      </section>
      <section className="press-card press-preview">
        <div className="press-panel-head"><div><strong>Live email preview</strong><small>Actual branded HTML + press footer · no sending</small></div>
          <div className="press-preview-buttons">
            <button type="button" onClick={()=>setMobile(!mobile)} aria-pressed={mobile}>{mobile?"Desktop":"Mobile"}</button>
            <button type="button" onClick={()=>setPreviewOpen(!previewOpen)} aria-expanded={previewOpen}>{previewOpen?"Hide":"Show"}</button>
          </div>
        </div>
        {previewOpen && (preview.error
          ? <p role="alert" className="press-alert press-alert-error">{preview.error}</p>
          : <iframe className={mobile?"press-preview-frame press-is-mobile":"press-preview-frame"}
              title="KONTA MOY press release email preview" srcDoc={preview.html} sandbox="" referrerPolicy="no-referrer"/>)}
      </section>
    </div>

    <div className="press-form-grid press-lower">
      <section className="press-card">
        <div className="press-panel-head"><div><strong>Recipients</strong><small>One address per line, or comma / semicolon separated. Duplicates removed.</small></div><span>{parsed.length} unique</span></div>
        <div className="press-field">
          <label htmlFor="press-recipients">Distribution addresses (can be left empty for a draft)</label>
          <textarea id="press-recipients" name="recipients" rows={7} value={recipients}
            onChange={e=>setRecipients(e.target.value)} disabled={!props.editable} placeholder="editor@newsroom.gr&#10;press@example.org"/>
        </div>
        {props.editable && props.lists.length > 0 && <div className="press-list-merge">
          <label htmlFor="press-select-list">Add a saved distribution list</label>
          <select id="press-select-list" value={selectedList} onChange={e=>setSelectedList(e.target.value)}>
            <option value="">Choose a list…</option>
            {props.lists.map(l=><option key={l.id} value={l.id}>{l.name} ({l.recipients.length})</option>)}
          </select>
          <button type="button" className="button button-secondary" disabled={!selectedList}
            onClick={()=>{
              const list=props.lists.find(l=>l.id===selectedList);
              if(!list)return;
              setRecipients([...new Set([...parsed,...list.recipients])].join("\n"));
              setSelectedList("");
            }}>Add contacts</button>
        </div>}
        <p className="press-help">Recipients receive separate emails. No recipient sees the other addresses. Maximum 500 per release; dispatch is limited to eight at a time.</p>
      </section>

      <section className="press-card">
        <div className="press-panel-head"><div><strong>Attachment</strong><small>Stored with the draft and included in test and live sends</small></div></div>
        {props.attachmentName && <p className="press-file-current">📎 {props.attachmentName}</p>}
        {props.editable ? <>
          <div className="press-field">
            <label htmlFor="press-attachment">Attach a document</label>
            <input id="press-attachment" name="attachment" type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"/>
          </div>
          {props.attachmentName && <label className="press-check"><input type="checkbox" checked={clearAttachment} onChange={e=>setClearAttachment(e.target.checked)}/> Remove existing attachment</label>}
          {clearAttachment && <input type="hidden" name="clearAttachment" value="yes"/>}
        </>:<p className="press-help">Attachments are frozen after preparation.</p>}
        <p className="press-help">PDF, DOCX, PNG or JPEG · maximum 3 MB total. Uploading a new file replaces the previous one.</p>
        <div className="press-identity"><strong>Sender</strong><span>research@kontamou.site</span><small>KONTA MOY · Research Press Office</small></div>
      </section>
    </div>
    {props.editable && <div className="press-save-row"><button className="button" type="submit">Save press release draft</button><small>Saving never sends email.</small></div>}
  </div>;
}
