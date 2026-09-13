import assert from 'node:assert/strict';
import { classifyLine } from '../reconciliation-calculations.mjs';
assert.equal(classifyLine({item_name:'Insurance'}).physical,false);
assert.equal(classifyLine({itemType:'shipping',item_name:'Shipping freight'}).physical,false);
assert.equal(classifyLine({item_name:'Administrative charge'}).physical,false);
assert.equal(classifyLine({item_name:'FreightMaster 5000',sku:'FM5000'},{itemSkus:new Set(['fm5000']),itemIds:new Set()}).classification,'physical');
assert.equal(classifyLine({item_name:'Gift diamond',physical:true,cf_gift_item:true}).physical,true);
assert.equal(classifyLine({item_name:'',sku:''}).classification,'uncertain');
console.log('CLASSIFICATION_FIXTURES=PASS (6)'); console.log('CLASSIFICATION_TESTS=PASS');
