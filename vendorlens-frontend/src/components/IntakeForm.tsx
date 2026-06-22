import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UploadCloud, FileText, Send } from 'lucide-react';

const IntakeForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    legal_name: '',
    website_domain: '',
    registration_number: '',
    jurisdiction_country: '',
    tax_identifier: '',
    registered_address: '',
    director_names: '',
    director_din: '',
    founder_ceo_name: '',
    linkedin_handle: '',
    twitter_handle: '',
    facebook_handle: '',
    corporate_email_domain: '',
    pan_number: '',
    city: '',
    mobile_number: '',
    msmed_certificate_number: ''
  });
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedVendors, setParsedVendors] = useState<any[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setLoading(true);
    
    try {
      const payload = new FormData();
      payload.append('file', selectedFile);
      const res = await axios.post('http://localhost:8000/vendor/parse-excel', payload);
      setParsedVendors(res.data.vendors || []);
    } catch (err) {
      console.error(err);
      alert('Error parsing Excel file');
    } finally {
      setLoading(false);
    }
  };

  const handleVendorSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) return;
    const vendor = parsedVendors[idx];
    setFormData({
      ...formData,
      ...vendor,
      director_names: vendor.director_names || '',
      director_din: vendor.director_din || ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formPayload = new FormData();
      
      const payload = {
        ...formData,
        director_names: formData.director_names ? formData.director_names.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
        director_din: formData.director_din ? formData.director_din.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
        social_handles: {
          linkedin: formData.linkedin_handle,
          twitter: formData.twitter_handle,
          facebook: formData.facebook_handle
        },
        source_method: file ? 'excel' : 'manual'
      };
      
      formPayload.append('manual_fields', JSON.stringify(payload));

      const res = await axios.post('http://localhost:8000/vendor/intake', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      navigate(`/scan/${res.data.input_id}`);
    } catch (err) {
      console.error(err);
      alert('Error submitting intake');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight">New Vendor Intake</h2>
        <p className="text-muted-foreground">Submit vendor data manually or upload the standard Excel template.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 text-primary">
            <UploadCloud className="w-6 h-6" />
            <h3 className="text-xl font-medium">Excel Upload</h3>
          </div>
          <p className="text-sm text-muted-foreground">Upload Vendor spreadsheet to autofill fields.</p>
          <input 
            type="file" 
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
          {parsedVendors.length > 0 && (
            <div className="pt-4 space-y-2">
              <label className="text-sm font-medium">Select a Vendor from Sheet</label>
              <select onChange={handleVendorSelect} className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">-- Choose Vendor --</option>
                {parsedVendors.map((v, i) => (
                  <option key={i} value={i}>
                    {v.legal_name} {v.registration_number ? `(${v.registration_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 text-primary">
            <FileText className="w-6 h-6" />
            <h3 className="text-xl font-medium">Manual Intake</h3>
          </div>
          <p className="text-sm text-muted-foreground">Review and edit fields below. They will be used for the background scan.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Legal Name <span className="text-destructive">*</span></label>
            <input required className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.legal_name} onChange={e => setFormData({...formData, legal_name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Website Domain</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="example.com" value={formData.website_domain} onChange={e => setFormData({...formData, website_domain: e.target.value})} />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Registration/BP Number</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.registration_number} onChange={e => setFormData({...formData, registration_number: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Jurisdiction Country (ISO)</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="US, IN, GB" value={formData.jurisdiction_country} onChange={e => setFormData({...formData, jurisdiction_country: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tax Identifier (GSTIN)</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.tax_identifier} onChange={e => setFormData({...formData, tax_identifier: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">PAN Number</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.pan_number} onChange={e => setFormData({...formData, pan_number: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">MSMED Certificate Number</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.msmed_certificate_number} onChange={e => setFormData({...formData, msmed_certificate_number: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Registered Address</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.registered_address} onChange={e => setFormData({...formData, registered_address: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">City</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
          </div>
        </div>

        <button disabled={loading} className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 disabled:opacity-50">
          {loading ? 'Processing...' : <><Send className="w-4 h-4 mr-2" /> Start Background Scan</>}
        </button>
      </form>
    </div>
  );
};
export default IntakeForm;
