import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unchangedInvoiceInputs } from './invoice-calculation-version.mjs'
const original={id:'one',items:{total:100},amount:100,status:'paid',syncConflict:false,computedProfit:10,updatedAt:'2026-09-25T00:00:00.000Z'}
test('permits a new version only for unchanged inputs',()=>{
  assert.equal(unchangedInvoiceInputs(original,{...original,computedProfit:20,updatedAt:new Date()}),true)
  for(const change of [{items:{total:101}},{amount:101},{status:'void'},{syncConflict:true},{newSourceField:1}])
    assert.equal(unchangedInvoiceInputs(original,{...original,...change}),false)
})
