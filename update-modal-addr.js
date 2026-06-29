const fs = require('fs');
let code = fs.readFileSync('src/components/SalesCallCampaignModal.tsx', 'utf8');

// Insert FiMapPin
code = code.replace(/FiChevronRight,/, 'FiChevronRight, FiMapPin,');

// Insert Account Address
const accountTarget = `<h3 className="text-lg font-black text-white leading-tight">{activeAccount.name}</h3>`;
const accountReplacement = `<h3 className="text-lg font-black text-white leading-tight">{activeAccount.name}</h3>
                    {(activeAccount.billingStreet || activeAccount.billingCity) && (
                      <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1 font-semibold">
                        <FiMapPin size={12} className="text-neutral-500" />
                        {activeAccount.billingStreet && \`\${activeAccount.billingStreet}, \`}
                        {activeAccount.billingCity && \`\${activeAccount.billingCity}, \`}
                        {activeAccount.billingState} {activeAccount.billingZip}
                      </div>
                    )}`;
code = code.replace(accountTarget, accountReplacement);

// Insert Contact Address
const contactTarget = `<span>{primaryContact ? \`\${primaryContact.firstName || ""} \${primaryContact.lastName || ""}\`.trim() : "No Contact Found"}</span>
                  </div>
                </div>`;
const contactReplacement = `<span>{primaryContact ? \`\${primaryContact.firstName || ""} \${primaryContact.lastName || ""}\`.trim() : "No Contact Found"}</span>
                  </div>
                  {primaryContact && (primaryContact.mailingStreet || primaryContact.mailingCity) && (
                    <div className="flex items-start gap-1.5 text-[10px] text-neutral-400 mt-1">
                      <FiMapPin size={10} className="text-neutral-500 mt-0.5 shrink-0" />
                      <span className="leading-tight">
                        {primaryContact.mailingStreet && \`\${primaryContact.mailingStreet}, \`}
                        {primaryContact.mailingCity && \`\${primaryContact.mailingCity}, \`}
                        {primaryContact.mailingState} {primaryContact.mailingZip}
                      </span>
                    </div>
                  )}
                </div>`;
code = code.replace(contactTarget, contactReplacement);

fs.writeFileSync('src/components/SalesCallCampaignModal.tsx', code);
console.log('Updated SalesCallCampaignModal.tsx');
