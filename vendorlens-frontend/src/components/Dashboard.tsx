import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ArrowLeft, CheckCircle2,
  RefreshCw, XCircle, ExternalLink, Building2, Globe, 
  ShieldCheck, Landmark, Database
} from 'lucide-react';

const Dashboard = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('PENDING');
  const [report, setReport] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'risk_analysis'>('overview');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const checkStatus = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/scan/${scanId}/status`);
        setStatus(res.data.status);
        if (res.data.status === 'COMPLETED') {
          clearInterval(interval);
          const rep = await axios.get(`http://localhost:8000/scan/${scanId}/report`);
          setReport(rep.data);
        }
      } catch (err) {
        console.error(err);
      }
    };

    checkStatus();
    if (status !== 'COMPLETED') {
      interval = setInterval(checkStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [scanId, status]);

  if (status !== 'COMPLETED') {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-8 bg-card border rounded-2xl shadow-sm text-center space-y-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Scan in Progress...</h2>
        <p className="text-muted-foreground text-sm">
          Our AI agents are analyzing multiple data sources. This may take a few minutes.
        </p>
        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
          <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
        </div>
        <button 
          onClick={() => navigate('/')} 
          className="mt-8 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-destructive transition-colors"
        >
          <XCircle className="w-4 h-4 mr-2" /> Cancel and Return Home
        </button>
      </div>
    );
  }

  if (!report) return null;

  const riskLevel = report.risk_summary?.overall_risk_level || 'UNKNOWN';

  const getRiskStyles = (level: string) => {
    switch(level) {
      case 'CRITICAL': return { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
      case 'HIGH': return { badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' };
      case 'MEDIUM': return { badge: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' };
      case 'LOW': return { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' };
      default: return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'gdelt':
      case 'newsapi': return <Globe className="w-3 h-3 mr-1" />;
      case 'opencorporates': return <Landmark className="w-3 h-3 mr-1" />;
      case 'sandbox_tsp': return <ShieldCheck className="w-3 h-3 mr-1" />;
      default: return <Database className="w-3 h-3 mr-1" />;
    }
  };

  const riskStyles = getRiskStyles(riskLevel);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Navigation */}
      <button 
        onClick={() => navigate('/')} 
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Intake
      </button>

      {/* Top-Level Summary Header Card */}
      <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {report.subject.legal_name || 'Unknown Entity'}
            </h1>
            {report.subject.domain && (
              <span className="px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium border">
                {report.subject.domain}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm flex items-center">
            <Building2 className="w-4 h-4 mr-1.5" /> 
            OSINT Due Diligence Report • {report.subject.scan_type?.toUpperCase()} SCAN
          </p>
        </div>

        <div className="flex flex-col items-end space-y-2">
          <div className={`px-4 py-2 rounded-xl border-2 font-bold text-lg flex items-center tracking-wide shadow-sm ${riskStyles.badge}`}>
            <div className={`w-3 h-3 rounded-full mr-2 animate-pulse ${riskStyles.dot}`}></div>
            {riskLevel} RISK
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {report.risk_summary.total_adverse_findings} Findings Detected
          </div>
        </div>
      </div>

      {/* Tabbed Navigation */}
      <div className="flex space-x-6 border-b border-border">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'overview'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview & Identity
        </button>
        <button
          onClick={() => setActiveTab('risk_analysis')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center ${
            activeTab === 'risk_analysis'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Risk Analysis 
          {report.risk_summary.total_adverse_findings > 0 && (
            <span className="ml-2 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
              {report.risk_summary.total_adverse_findings}
            </span>
          )}
        </button>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Identity & Registries Block */}
            <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-5">
              <h3 className="text-lg font-semibold flex items-center">
                <Landmark className="w-5 h-5 mr-2 text-primary" /> Corporate Registries
              </h3>
              
              {report.sources_summary?.opencorporates?.length > 0 ? (
                <div className="space-y-4">
                  {report.sources_summary.opencorporates.map((comp: any, idx: number) => (
                    <div key={idx} className="bg-secondary/30 rounded-xl p-4 border border-secondary">
                      <div className="font-semibold text-foreground mb-1">{comp.name}</div>
                      <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2">
                        <div><span className="font-medium">Reg Number:</span> {comp.company_number}</div>
                        <div><span className="font-medium">Jurisdiction:</span> {comp.jurisdiction_code?.toUpperCase()}</div>
                        <div className="col-span-2 flex items-center mt-1">
                          <span className={`w-2 h-2 rounded-full mr-2 ${comp.current_status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {comp.current_status || 'Unknown'}
                        </div>
                      </div>
                      {/* Inline Source */}
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center"><Landmark className="w-3 h-3 mr-1" /> OpenCorporates Registry</span>
                        <a href={`https://opencorporates.com/companies/${comp.jurisdiction_code}/${comp.company_number}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline">
                          View Record <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No registry data found.</p>
              )}
            </div>

            {/* Tax & Compliance Block */}
            <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-5">
              <h3 className="text-lg font-semibold flex items-center">
                <ShieldCheck className="w-5 h-5 mr-2 text-primary" /> Tax & Compliance
              </h3>
              
              <div className="space-y-4">
                {report.sources_summary?.sandbox_tsp?.gstin && (
                  <div className="bg-secondary/30 rounded-xl p-4 border border-secondary">
                    <div className="font-semibold text-foreground mb-1">GSTIN Verification</div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Status: <span className="font-medium text-foreground">{report.sources_summary.sandbox_tsp.gstin.status || 'Active'}</span></div>
                      <div>Validity: <span className={report.sources_summary.sandbox_tsp.gstin.valid ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>{report.sources_summary.sandbox_tsp.gstin.valid ? 'VALID' : 'INVALID'}</span></div>
                      {report.sources_summary.sandbox_tsp.gstin.name && <div>Entity: {report.sources_summary.sandbox_tsp.gstin.name}</div>}
                    </div>
                    {/* Inline Source */}
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center"><ShieldCheck className="w-3 h-3 mr-1" /> Sandbox TSP</span>
                    </div>
                  </div>
                )}

                {report.sources_summary?.whois && (
                  <div className="bg-secondary/30 rounded-xl p-4 border border-secondary">
                    <div className="font-semibold text-foreground mb-1">Domain WHOIS</div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Domain: {report.sources_summary.whois.domain_name}</div>
                      <div>Registrar: {report.sources_summary.whois.registrar}</div>
                      <div>Created: {report.sources_summary.whois.creation_date ? new Date(report.sources_summary.whois.creation_date).toLocaleDateString() : 'N/A'}</div>
                    </div>
                    {/* Inline Source */}
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center"><Globe className="w-3 h-3 mr-1" /> WHOIS Database</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Web Presence Summary (Serper/NewsAPI snippet) */}
          {report.sources_summary?.serper?.length > 0 && (
            <div className="bg-card border rounded-2xl p-6 shadow-sm">
               <h3 className="text-lg font-semibold mb-4">Web Presence Snippets</h3>
               <div className="grid md:grid-cols-2 gap-4">
                  {report.sources_summary.serper.slice(0, 4).map((item: any, idx: number) => (
                    <div key={idx} className="bg-secondary/20 p-4 rounded-xl border text-sm flex flex-col justify-between">
                      <div className="space-y-2 mb-3">
                        <div className="font-semibold line-clamp-1">{item.title}</div>
                        <p className="text-muted-foreground text-xs line-clamp-2">{item.snippet}</p>
                      </div>
                      <div className="border-t border-border pt-2">
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center text-xs text-primary hover:underline w-fit">
                          {new URL(item.link).hostname} <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Tokens Box */}
          <div className="flex gap-4">
            <div className="flex-1 bg-secondary/10 border rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tokens Consumed</div>
                <div className="text-xl font-bold text-foreground mt-1">{report.tokens_used?.toLocaleString() || 0}</div>
              </div>
              <RefreshCw className="w-6 h-6 text-muted-foreground opacity-30" />
            </div>
            <div className="flex-1 bg-secondary/10 border rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">API Balance</div>
                <div className="text-xl font-bold text-foreground mt-1">{report.tokens_remaining?.toLocaleString() || 0}</div>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-500 opacity-30" />
            </div>
          </div>

        </div>
      )}

      {/* Risk Analysis Tab Content */}
      {activeTab === 'risk_analysis' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {report.adverse_findings?.length > 0 ? (
            <div className="space-y-4">
              {report.adverse_findings.map((finding: any) => {
                const fStyles = getRiskStyles(finding.severity);

                // Try to find a matching URL for the source if applicable
                let sourceUrl = null;
                if (finding.evidence?.source_tool === 'gdelt' && report.sources_summary?.gdelt?.length > 0) {
                  sourceUrl = report.sources_summary.gdelt[0].url;
                } else if (finding.evidence?.source_tool === 'newsapi' && report.sources_summary?.newsapi?.length > 0) {
                  sourceUrl = report.sources_summary.newsapi[0].url;
                } else if (finding.evidence?.source_tool === 'serper' && report.sources_summary?.serper?.length > 0) {
                  sourceUrl = report.sources_summary.serper[0].link;
                }

                return (
                  <div key={finding.finding_id} className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3">
                        <div className={`mt-1.5 flex-shrink-0 w-3 h-3 rounded-full ${fStyles.dot} shadow-sm`} />
                        <div>
                          <h4 className="font-bold text-lg text-foreground">{finding.title}</h4>
                          <div className="text-sm text-muted-foreground mt-1">{finding.detail}</div>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-md font-semibold border whitespace-nowrap ${fStyles.badge}`}>
                        {finding.severity}
                      </span>
                    </div>

                    {/* Inline Evidence & Source */}
                    <div className="ml-6 bg-secondary/30 rounded-xl p-4 border border-secondary space-y-3">
                      <div className="text-sm font-mono text-muted-foreground whitespace-pre-wrap break-words">
                        "{finding.evidence.raw_excerpt}"
                      </div>
                      
                      <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs">
                        <span className="flex items-center text-muted-foreground font-medium uppercase tracking-wider">
                          {getSourceIcon(finding.evidence.source_tool)}
                          Source: {finding.evidence.source_name || finding.evidence.source_tool}
                        </span>
                        
                        {sourceUrl ? (
                          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline font-medium">
                            Verify Original Source <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        ) : finding.evidence.source_name ? (
                          <span className="text-muted-foreground italic">External validation required</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-12 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-emerald-800 tracking-tight">No Adverse Findings</h3>
                <p className="text-emerald-700 mt-2">The vendor passed all AI diligence checks included in this scan depth. No risks were flagged.</p>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default Dashboard;
