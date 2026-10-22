import test from "node:test";
import assert from "node:assert/strict";
import {validateApplication,validateProposal,validEmail} from "../lib/validation.ts";
const application={business_name:"Κατάστημα Σπάρτης",representative_name:"Δημήτρης Παπαδόπουλος",location:"Σπάρτη",sector:"Λιανικό εμπόριο",registry_number:null,description:"Μικρή ανεξάρτητη εμπορική επιχείρηση στην πόλη μας."};
test("valid member application accepted",()=>assert.equal(validateApplication(application),null));
test("invalid application rejected",()=>assert.ok(validateApplication({...application,business_name:"X"})));
test("valid proposal accepted",()=>assert.equal(validateProposal({title:"Αντικατάσταση εξοπλισμού",category:"growth",amount_cents:680000,details:"Η επιχείρηση χρειάζεται νέο εξοπλισμό επειδή ο τωρινός έχει υποστεί βλάβη. Η επένδυση θα διατηρήσει την παραγωγή."}),null));
test("out-of-range proposed amount rejected",()=>assert.ok(validateProposal({title:"Αντικατάσταση εξοπλισμού",category:"growth",amount_cents:Infinity,details:"Η επιχείρηση χρειάζεται νέο εξοπλισμό επειδή ο τωρινός έχει υποστεί βλάβη. Η επένδυση θα διατηρήσει την παραγωγή."})));
test("email validation",()=>{assert.equal(validEmail("owner@example.gr"),true);assert.equal(validEmail("bad@"),false);});
