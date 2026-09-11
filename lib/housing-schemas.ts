import { z } from "zod";
import { housingCategories, housingFeatures, housingLifestylePreferences, housingListingTypes, housingReportReasons, housingStayLengths } from "@/lib/housing-types";

const optionalMoney=z.coerce.number().int().min(0).max(500000).optional();
const booleanValue=z.preprocess((value)=>value===true||value==="true",z.boolean());
export const housingListingSchema=z.object({
  listingType:z.enum(housingListingTypes), category:z.enum(housingCategories), title:z.string().trim().min(5).max(120), locality:z.string().trim().min(2).max(100), availableFrom:z.iso.date(), stayLength:z.enum(housingStayLengths),
  shortDescription:z.string().trim().min(20).max(240), description:z.string().trim().min(50).max(4000), priceMonthly:z.coerce.number().int().min(0).max(200000), utilitiesIncluded:booleanValue, utilitiesAmount:optionalMoney, depositAmount:optionalMoney,
  availableSpots:z.coerce.number().int().min(1).max(20).optional(), currentOccupants:z.coerce.number().int().min(0).max(30).optional(), furnished:z.preprocess((value)=>value===""||value==null?undefined:value===true||value==="true",z.boolean().optional()), transitAccess:z.string().trim().max(160).optional().or(z.literal("")),
  features:z.array(z.enum(housingFeatures)).max(8).default([]), wantedPersonCount:z.coerce.number().int().min(1).max(10).optional(), lifestylePreferences:z.array(z.enum(housingLifestylePreferences)).max(6).default([]), cityId:z.literal("brno").default("brno"), company:z.string().max(0).optional().default(""),
}).superRefine((value,ctx)=>{
  if(!value.utilitiesIncluded && value.utilitiesAmount==null) ctx.addIssue({code:"custom",path:["utilitiesAmount"],message:"Doplňte výši energií nebo označte, že jsou zahrnuté."});
  if(value.listingType==="offer" && value.availableSpots==null) ctx.addIssue({code:"custom",path:["availableSpots"],message:"Doplňte počet volných míst."});
  if(value.listingType==="wanted" && value.wantedPersonCount==null) ctx.addIssue({code:"custom",path:["wantedPersonCount"],message:"Doplňte počet osob."});
});

export const housingListingUpdateSchema=z.object({
  action:z.enum(["update","hide","reopen","renew","occupied","found"]), version:z.number().int().positive(), title:z.string().trim().min(5).max(120).optional(), locality:z.string().trim().min(2).max(100).optional(), availableFrom:z.iso.date().optional(), stayLength:z.enum(housingStayLengths).optional(), shortDescription:z.string().trim().min(20).max(240).optional(), description:z.string().trim().min(50).max(4000).optional(), priceMonthly:z.number().int().min(0).max(200000).optional(), utilitiesIncluded:z.boolean().optional(), utilitiesAmount:z.number().int().min(0).max(100000).nullable().optional(), depositAmount:z.number().int().min(0).max(500000).nullable().optional(), availableSpots:z.number().int().min(1).max(20).optional(), currentOccupants:z.number().int().min(0).max(30).optional(), furnished:z.boolean().optional(), transitAccess:z.string().trim().max(160).optional(), features:z.array(z.enum(housingFeatures)).max(8).optional(), wantedPersonCount:z.number().int().min(1).max(10).optional(), lifestylePreferences:z.array(z.enum(housingLifestylePreferences)).max(6).optional(),
}).refine((value)=>value.action!=="update"||Object.keys(value).some((key)=>!["action","version"].includes(key)),"Není co změnit.");
export const housingReportSchema=z.object({reason:z.enum(housingReportReasons),detail:z.string().trim().max(1200).default(""),company:z.string().max(0).optional().default("")});
export const housingModerationSchema=z.object({listingId:z.string().uuid(),action:z.enum(["approve","reject","hide","restore","delete","resolve_report","dismiss_report","restrict_author"]),reason:z.string().trim().min(2).max(1000),reportId:z.string().uuid().optional()});
