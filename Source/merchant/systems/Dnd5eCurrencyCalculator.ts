import CurrencyCalculator from "./CurrencyCalculator";
// @ts-ignore
import MerchantSheet from "../MerchantSheet";
import {PropertiesToSource} from "@league-of-foundry-developers/foundry-vtt-types/src/types/helperTypes";
import {ItemData} from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs";
import Globals from "../../Globals";
import MerchantCurrency from "../model/MerchantCurrency";
import HtmlHelpers from "../../Utils/HtmlHelpers";
import Logger from "../../Utils/Logger";

let conversionRates: {[key:string]: number} = {"pp": 1,
	"gp": 10,
	"ep": 2,
	"sp": 5,
	"cp": 10
};


const convertFromHigherCurrency: {[key:string]: string} = {"cp": "sp", "sp": "ep", "ep": "gp", "gp": "pp"};


export default class Dnd5eCurrencyCalculator extends CurrencyCalculator {

	useEP: unknown = true;

	async onDropItemCreate(itemData: PropertiesToSource<ItemData>, caller: MerchantSheet) {
		// Create a Consumable spell scroll on the Inventory tab
		if ((itemData.type === "spell")) {
			const scroll = await this.createScroll(itemData);
			// @ts-ignore
			return caller.callSuperOnDropItemCreate(scroll);
		}
		return caller.callSuperOnDropItemCreate(itemData);
	}

	async createScrollFromSpell(spell: PropertiesToSource<ItemData>): Promise<PropertiesToSource<ItemData>> {
		const itemData = spell;
		// const {actionType, description, source, activation, duration, target, range, damage, save, level} = itemData.data;
		// @ts-ignore
		let level = spell.data.level;
		// @ts-ignore
		let description = spell.data.description;
		// @ts-ignore

		// Get scroll data
		// @ts-ignore
		const scrollUuid = `Compendium.${CONFIG.DND5E.sourcePacks.ITEMS}.${CONFIG.DND5E.spellScrollIds[level]}`;
		const scrollItem = await fromUuid(scrollUuid);
		// @ts-ignore
		const scrollData = scrollItem.toObject();
		delete scrollData._id;
		// Split the scroll description into an intro paragraph and the remaining details
		const scrollDescription = scrollData.data.description.value;
		const pdel = "</p>";
		const scrollIntroEnd = scrollDescription.indexOf(pdel);
		const scrollIntro = scrollDescription.slice(0, scrollIntroEnd + pdel.length);
		const scrollDetails = scrollDescription.slice(scrollIntroEnd + pdel.length);

		// Create a composite description from the scroll description and the spell details
		const desc = `${scrollIntro}<hr/><h3>${itemData.name} (Level ${level})</h3><hr/>${description.value}<hr/><h3>Scroll Details</h3><hr/>${scrollDetails}`;

		let clone = duplicate(itemData);
		clone.name = `${game.i18n.localize("DND5E.SpellScroll")}: ${itemData.name}`;
		clone.img = scrollData.img
		clone.type = "consumable";
		// @ts-ignore
		clone.data.description.value = desc.trim()
		// @ts-ignore
		return clone;
	}

	async createScroll(itemData: PropertiesToSource<ItemData>): Promise<PropertiesToSource<ItemData>> {
		return this.createScrollFromSpell(itemData);
	}

	actorCurrency(actor: Actor) {
		// @ts-ignore
		return actor.system.currency;
	}

	merchantCurrency(actor: Actor): MerchantCurrency[] {
		return [
			{
				name: "pp",
				value: this.actorCurrency(actor).pp
			},
			{
				name: "gp",
				value: this.actorCurrency(actor).gp
			},
			{
				name: "ep",
				value: this.actorCurrency(actor).ep
			},
			{
				name: "sp",
				value: this.actorCurrency(actor).sp
			},
			{
				name: "cp",
				value: this.actorCurrency(actor).cp
			}
		];
	}

	buyerHaveNotEnoughFunds(itemCostInGold: number, buyerFunds: any) {

		let itemCostInCopper = this.convertCurrencyToLowest({gp: itemCostInGold})
		let buyerFundsAsCopper = this.convertCurrencyToLowest(buyerFunds);
		console.log("item price > buyerFundsInCopper", itemCostInCopper, buyerFundsAsCopper)
		return itemCostInCopper > buyerFundsAsCopper;
	}

	convertToPlatinum(buyerFunds: any) {
		let buyerFundsAsPlatinum = buyerFunds["pp"];
		buyerFundsAsPlatinum += buyerFunds["gp"] / conversionRates["gp"];
		buyerFundsAsPlatinum += buyerFunds["ep"] / conversionRates["gp"] / conversionRates["ep"];
		buyerFundsAsPlatinum += buyerFunds["sp"] / conversionRates["gp"] / conversionRates["ep"] / conversionRates["sp"];
		buyerFundsAsPlatinum += buyerFunds["cp"] / conversionRates["gp"] / conversionRates["ep"] / conversionRates["sp"] / conversionRates["cp"];


		return buyerFundsAsPlatinum;
	}

	updateActorWithNewFunds(buyer: Actor, buyerFunds: any) {
		buyer.update({"data.currency": buyerFunds});
	}

	convertCurrencyToLowest(buyerFunds: any): number {
		let buyerFundsAsCopper = 0;
		if (buyerFunds["cp"]) {
			buyerFundsAsCopper += buyerFunds["cp"];
		}
		if (buyerFunds["sp"]) {
			buyerFundsAsCopper += buyerFunds["sp"] * conversionRates["cp"];
		}
		if (buyerFunds["ep"]) {
			buyerFundsAsCopper += buyerFunds["ep"] * conversionRates["sp"] * conversionRates["cp"];
		}
		if (buyerFunds["gp"]) {
			buyerFundsAsCopper += buyerFunds["gp"] * conversionRates["ep"] * conversionRates["sp"] * conversionRates["cp"];
		}
		if (buyerFunds["pp"]) {
			buyerFundsAsCopper += buyerFunds["pp"] * conversionRates["gp"] * conversionRates["ep"] * conversionRates["sp"] * conversionRates["cp"];
		}
		return Math.floor(buyerFundsAsCopper)
	}

	subtractAmountFromActor(buyer: Actor, buyerFunds: any, itemCostInGold: number) {
		buyerFunds = this.calculateNewBuyerFunds(itemCostInGold, buyerFunds);
		if (!this.useEP) {
			this.convertEP(buyerFunds);
		}
		// buyerFunds = buyerFunds - itemCostInGold;
		this.updateActorWithNewFunds(buyer, buyerFunds);
		console.log(`Merchant sheet | Funds after purchase: ${buyerFunds}`);
	}

	public convertEP(buyerFunds: any): any {
		if (buyerFunds["ep"] > 0) {
			let restEP = buyerFunds["ep"] % conversionRates["ep"];
			if (restEP > 0) {
				buyerFunds["sp"] = restEP * conversionRates["sp"];
				buyerFunds["ep"] -= restEP;
			}
			let higherFund = Math.floor(buyerFunds["ep"] / conversionRates["ep"]);
			if (higherFund > 0) {
				buyerFunds["gp"] += higherFund
				buyerFunds["ep"] = 0;
			}
		}
		return buyerFunds;
	}

	public calculateNewBuyerFunds(itemCostInGold: number, funds: any): any {
		let itemCostInCopper = this.convertCurrencyToLowest({gp: itemCostInGold})
		let buyerFundsInCopper = this.convertCurrencyToLowest(funds);
		if ((buyerFundsInCopper - itemCostInCopper) < 0) {
			throw "Could not do the transaction"
		}
		Logger.Log('buyerFundsInCopper', buyerFundsInCopper);

		let buyerFunds = funds;
		buyerFunds["cp"] -= itemCostInCopper
		this.subtractAndConvertToHigherFund(buyerFunds, "cp");
		return buyerFunds;
	}

	public calculatePriceToBuyerFunds(itemCostInGold: number): any {
		let itemCostInCopper = this.convertCurrencyToLowest({gp: itemCostInGold})

		let buyerFunds = {pp: 0, gp: 0, ep: 0, sp: 0, cp: itemCostInCopper};
		this.convertToHigherFund(buyerFunds, "cp");
		return buyerFunds;
	}

	private convertToHigherFund(buyerFunds: any, currency: string) {
		let higherCurrency: string = convertFromHigherCurrency[currency];
		if (higherCurrency) {
			let higherCurrencyNeeded = Math.floor((buyerFunds[currency]) / conversionRates[currency])
			let rest = (buyerFunds[currency]) % conversionRates[currency];
			if (rest != 0) {
				buyerFunds[currency] = rest;
			} else {
				buyerFunds[currency] = 0
			}
			if (higherCurrencyNeeded > 0) {
				buyerFunds[higherCurrency] = higherCurrencyNeeded;
				this.convertToHigherFund(buyerFunds, higherCurrency);
			}
		}
		return buyerFunds;
	}

	private subtractAndConvertToHigherFund(buyerFunds: any, currency: string) {
		let higherCurrency: string = convertFromHigherCurrency[currency];
		if (higherCurrency && buyerFunds[currency] < 0) {
			let higherCurrencyNeeded = Math.floor((-1 * buyerFunds[currency]) / conversionRates[currency])
			let rest = (-1 * buyerFunds[currency]) % conversionRates[currency];
			if (rest != 0) {
				higherCurrencyNeeded += 1
				buyerFunds[currency] = (conversionRates[currency] - rest);
			} else {
				buyerFunds[currency] = 0
			}
			buyerFunds[higherCurrency] -= higherCurrencyNeeded;

			if (buyerFunds[higherCurrency] < 0) {
				this.subtractAndConvertToHigherFund(buyerFunds, higherCurrency);
			}
		}
	}

	addAmountForActor(seller: Actor, sellerFunds: any, itemCostInGold: number) {
		let itemCostInCopper = this.convertCurrencyToLowest({gp: itemCostInGold})

		let convertToHigherFund = this.convertToHigherFund({pp: 0, gp: 0, ep: 0, sp: 0, cp: itemCostInCopper}, "cp");
		sellerFunds["cp"] += convertToHigherFund["cp"]
		sellerFunds["sp"] += convertToHigherFund["sp"]
		sellerFunds["ep"] += convertToHigherFund["ep"]
		sellerFunds["gp"] += convertToHigherFund["gp"]
		sellerFunds["pp"] += convertToHigherFund["pp"]
		if (!this.useEP) {
			sellerFunds["sp"] += sellerFunds["ep"] * conversionRates["sp"];
			sellerFunds["ep"] = 0;
		}
		this.updateActorWithNewFunds(seller, sellerFunds);
	}

	getPriceOutputWithModifier(basePriceItem: Item, modifier: number) {
		// @ts-ignore
		let basePrice = basePriceItem.system.price
		return this.priceInText((basePrice * modifier * 100) / 100)
	}


	priceInText(itemCostInGold: number): string {
		let priceToBuyerFunds = this.calculatePriceToBuyerFunds(itemCostInGold);
		let returnValue: string = '';
		let gp = priceToBuyerFunds['gp'];
		if (priceToBuyerFunds['pp'] > 0) {
			gp += (priceToBuyerFunds['pp'] * conversionRates['gp'])
		}
		returnValue += gp + 'gp';
		if (this.useEP) {
			returnValue += this.getValueIfPresent(priceToBuyerFunds, 'ep');
			returnValue += this.getValueIfPresent(priceToBuyerFunds, 'sp');
		} else if (priceToBuyerFunds['ep'] > 0 || priceToBuyerFunds['sp'] > 0) {
			let sp = priceToBuyerFunds['sp'];
			if (priceToBuyerFunds['ep'] > 0) {
				sp += (priceToBuyerFunds['ep'] * conversionRates['sp'])
			}
			returnValue += ' ' + sp + 'sp';
		}
		returnValue += this.getValueIfPresent(priceToBuyerFunds, 'cp');
		return returnValue.trim();
	}

	private getValueIfPresent(priceToBuyerFunds: any, currency: string): string {
		if (priceToBuyerFunds[currency]) {
			return ' ' + priceToBuyerFunds[currency] + currency;
		}
		return '';
	}

	public prepareItems(items: any) {

		Logger.Log("Prepare Features");
		// Actions
		const features = {
			weapons: {
				label: game.i18n.localize("MERCHANTNPC.weapons"),
				items: [],
				type: "weapon"
			},
			equipment: {
				label: game.i18n.localize("MERCHANTNPC.equipment"),
				items: [],
				type: "equipment"
			},
			consumables: {
				label: game.i18n.localize("MERCHANTNPC.consumables"),
				items: [],
				type: "consumable"
			},
			tools: {
				label: game.i18n.localize("MERCHANTNPC.tools"),
				items: [],
				type: "tool"
			},
			containers: {
				label: game.i18n.localize("MERCHANTNPC.containers"),
				items: [],
				type: "container"
			},
			loot: {
				label: game.i18n.localize("MERCHANTNPC.loot"),
				items: [],
				type: "loot"
			},

		};
		// @ts-ignore
		features.weapons.items = items.weapon
		features.weapons.items.sort(this.sort());
		// @ts-ignore
		features.equipment.items = items.equipment
		features.equipment.items.sort(this.sort());

		// @ts-ignore
		features.consumables.items = items.consumable
		features.consumables.items.sort(this.sort());
		// @ts-ignore
		features.tools.items = items.tool
		features.tools.items.sort(this.sort());

		// @ts-ignore
		features.containers.items = items.backpack
		features.containers.items.sort(this.sort());
		// @ts-ignore
		features.loot.items = items.loot
		features.loot.items.sort(this.sort());
		return features;
	}


	public sort() {
		return function (a: ItemData, b: ItemData) {
			return a.name.localeCompare(b.name);
		};
	}

	public initSettings() {

		conversionRates = {
			"pp": 1,
			// @ts-ignore
			"gp": CONFIG.DND5E.currencies.gp.conversion.each,
			// @ts-ignore
			"ep": CONFIG.DND5E.currencies.ep.conversion.each,
			// @ts-ignore
			"sp": CONFIG.DND5E.currencies.sp.conversion.each,
			// @ts-ignore
			"cp": CONFIG.DND5E.currencies.cp.conversion.each
		};
		this.registerSystemSettings();
		this.useEP = game.settings.get(Globals.ModuleName, "useEP");
		super.initSettings();
	}

	public registerSystemSettings() {
		game.settings.register(Globals.ModuleName, "useEP", {
			name: game.i18n.format("MERCHANTNPC.global-settings.use-ep-name"),
			hint: game.i18n.format("MERCHANTNPC.global-settings.use-ep-hint"),
			scope: "world",
			config: true,
			default: true,
			type: Boolean
		});
	}

	getPriceFromItem(item: Item) {
		// @ts-ignore
		return item.system.price;
	}

	getPriceItemKey() {
		return "system.price";
	}

	currency(): string {
		return 'GP';
	}

	updateMerchantCurrency(actor: Actor) {
		let pp: number = HtmlHelpers.getHtmlInputNumberValue("currency-pp", document);
		let gp: number = HtmlHelpers.getHtmlInputNumberValue("currency-gp", document);
		let ep: number = HtmlHelpers.getHtmlInputNumberValue("currency-ep", document);
		let sp: number = HtmlHelpers.getHtmlInputNumberValue("currency-sp", document);
		let cp: number = HtmlHelpers.getHtmlInputNumberValue("currency-cp", document);
		this.updateActorWithNewFunds(actor, {pp, gp, ep, sp, cp});
	}
}