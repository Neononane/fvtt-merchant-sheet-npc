import Globals from "../../Globals";
import Logger from "../../Utils/Logger";
import MerchantGenerator from "../model/MerchantGenerator";
import MerchantSheet from "../MerchantSheet";
import MerchantSettings from "../../Utils/MerchantSettings";
import MerchantSheetNPCHelper from "../MerchantSheetNPCHelper";
import merchantSheetNPCHelper from "../MerchantSheetNPCHelper";

export class GeneratorWindow extends Application {
	actor
	private merchantSheetNPC: MerchantSheetNPCHelper = new MerchantSheetNPCHelper()
	constructor(object: Actor, options: any) {
		super();
		this.actor = object
	}

	static get defaultOptions() {
		const options = super.defaultOptions;
		options.id = "generate-items";
		options.title = game.i18n.localize("MERCHANTNPC.generator-page.window-title");
		options.template = "modules/" + Globals.ModuleName + "/templates/generator.html";
		options.width = 600;
		options.height = "auto";
		options.resizable = false;
		return options;

	}

	getData() {
		return {
			rolltables: game.tables,
			compendiums: MerchantSettings.getCompendiumnsChoices(),
			data: {rolltables: game.tables, compendiums: MerchantSettings.getCompendiumnsChoices()}
		};
	}

	activateListeners(html: JQuery<HTMLElement>) {
		// Change roll bonus
		html.find('.generate-items').on('click', () => {
			Logger.Log("Generator called")
			let generatorInput = new MerchantGenerator(
				MerchantSheet.getHtmlInputStringValue("data.selector", document),
				MerchantSheet.getHtmlInputStringValue("data.rolltable", document),
				MerchantSheet.getHtmlInputStringValue("data.compendium", document),
				MerchantSheet.getHtmlInputStringValue("data.shopQty", document),
				MerchantSheet.getHtmlInputStringValue("data.itemQty", document),
				MerchantSheet.getHtmlInputNumberValue("data.itemQtyLimit", document),
				MerchantSheet.getHtmlInputStringValue("data.itemPrice", document),
				MerchantSheet.getHtmlInputBooleanValue("data.clearInventory", document),
				MerchantSheet.getHtmlInputBooleanValue("data.importAll", document)
			);
			if (validateInput(generatorInput)) {
				MerchantSheet.generateItems(this.actor, generatorInput);
			}
			console.log("Generate: ", generatorInput);

		});
		html.find('.generator-selector').change(event => this.merchantSheetNPC.onGeneratorSelectorChanged(event));

		super.activateListeners(html);

		function validateInput(generatorInput: MerchantGenerator) {
			if (generatorInput.selected === 'table' && !generatorInput.table) {
				ui.notifications?.error("For generating items a table needs to be selected")
				return false;
			}
			if (generatorInput.selected === 'compendium' && !generatorInput.compendium) {
				ui.notifications?.error("For generating items a compendium needs to be selected")
				return false;
			}

			return true;
		}
	}


}
