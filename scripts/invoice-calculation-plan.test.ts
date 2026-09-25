import { describe, it, expect } from 'vitest'
import { invoiceCalculationPlan } from './invoice-calculation-plan'
const row = { status: 'Paid', items: { sub_total: 100, deadCostSubjectToVig: 20, deadCostNoVig: 10, commissionPercent: 50 } }
const source = { status: 'paid', total: 125, balance: 0, date: '2024-05-01', salesperson_name: 'TEST REP' }
const card = [{ amount: 125, mode: 'Credit Card' }]
describe('invoice reconciliation evidence gates', () => {
  it('includes tax/shipping in card fee and preserves subtotal as revenue', () => {
    const result = invoiceCalculationPlan(row, source, null, card, [], {})
    expect(result.ready).toBe(true)
    if(result.ready) expect(result.values).toMatchObject({ sub_total:100, total:125, ccFees:5.63, profit:58.37, commission:29.19 })
  })
  it('does not charge check or Zelle payments', () => {
    for(const mode of ['Check','ZELLE']) {
      const result=invoiceCalculationPlan(row,source,null,[{amount:125,mode}],[],{})
      expect(result.ready && result.values.ccFees).toBe(0)
    }
  })
  it('blocks an offline payment instead of assuming cash or card', () => {
    expect(invoiceCalculationPlan(row,source,null,[{amount:125,mode:'Offline'}],[],{})).toMatchObject({ready:false,reason:'UNVERIFIED_PAYMENT_MODE'})
  })
  it('charges once when a confirmed card payment accompanies an offline payment', () => {
    const result=invoiceCalculationPlan(row,source,null,[{amount:25,mode:'Credit Card'},{amount:100,mode:'Offline'}],[],{})
    expect(result.ready && result.values.ccFees).toBe(5.63)
  })
  it('blocks missing payment evidence on a paid invoice', () => {
    expect(invoiceCalculationPlan(row,source,null,[],[],{})).toMatchObject({ready:false,reason:'MISSING_PAYMENT_EVIDENCE'})
  })
  it('requires the payments to reconcile after documented applied credits', () => {
    const payment=[{amount:25,mode:'Check'}]
    expect(invoiceCalculationPlan(row,source,null,payment,[],{})).toMatchObject({ready:false,reason:'PAYMENT_TOTAL_MISMATCH'})
    const result=invoiceCalculationPlan(row,{...source,credits_applied:100},null,payment,[],{})
    expect(result.ready && result.values.ccFees).toBe(0)
  })
  it('blocks missing costs rather than using a catalog or percentage estimate', () => {
    expect(invoiceCalculationPlan(row,source,{sub_total:100,total:125,line_items:[{quantity:1,purchase_rate:'',rate:100}]},card,[],{})).toMatchObject({ready:false,reason:'UNVERIFIED_LINE_COST'})
  })
  it('ignores a zero-value tracking memo but still blocks an uncosted gift', () => {
    const doc={sub_total:100,total:125,line_items:[{name:'Blade',quantity:1,purchase_rate:20,rate:100},{name:'TRACKING INFORMATION',quantity:1,purchase_rate:'',rate:0,item_total:0}]}
    expect(invoiceCalculationPlan(row,source,doc,card,[],{}).ready).toBe(true)
    doc.line_items[1].name='Gift knife'
    expect(invoiceCalculationPlan(row,source,doc,card,[],{}).ready).toBe(false)
  })
  it('uses the existing nonphysical freight classification without inventing product cost', () => {
    const doc={sub_total:100,total:125,line_items:[{name:'Blade',quantity:1,purchase_rate:20,rate:90},{name:'Freight',quantity:1,purchase_rate:'',rate:10,item_total:10}]}
    const result=invoiceCalculationPlan(row,source,doc,card,[],{})
    expect(result.ready && result.values.deadCostTotal).toBe(20)
  })
  it('does not stamp or calculate voided documents and conflicts', () => {
    expect(invoiceCalculationPlan(row,{...source,status:'void'},null,card,[],{}).ready).toBe(false)
    expect(invoiceCalculationPlan({...row,syncConflict:true},source,null,card,[],{}).ready).toBe(false)
  })
  it('preserves a historical 1.5 VIG penalty when no monthly override replaces it', () => {
    const result=invoiceCalculationPlan({...row,items:{...row.items,vigRate:1.5}},{...source,date:'2025-05-01'},null,card,[{id:'rep',name:'TEST REP'}],{})
    expect(result.ready && result.values.vigRate).toBe(1.5)
  })
  it('honors an explicit monthly exception over the historical baseline', () => {
    const result=invoiceCalculationPlan(row,source,null,card,[{id:'rep',name:'TEST REP'}],{rep:{monthlyVigGoals:[{monthKey:'2024-05',manualVigRate:1.5}]}})
    expect(result.ready && result.values.vigRate).toBe(1.5)
  })
  it('uses the persisted cent-rounded cost buckets consistently in profit', () => {
    const result=invoiceCalculationPlan({...row,items:{...row.items,deadCostSubjectToVig:20.005}},source,null,card,[],{})
    expect(result.ready).toBe(true)
    if(result.ready){
      expect(result.values.deadCostSubjectToVig).toBe(20.01)
      expect(result.values.deadCostPlusVig).toBe(36.01)
      expect(result.values.profit).toBe(58.36)
    }
  })
})
