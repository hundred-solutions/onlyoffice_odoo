/** @odoo-module **/
import { Dialog } from "@web/core/dialog/dialog";
import { Pager } from "@web/core/pager/pager";
import { DropPrevious } from "web.concurrency";
import { SearchModel } from "@web/search/search_model";
import { useService } from "@web/core/utils/hooks";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { getDefaultConfig } from "@web/views/view";

import { _t } from "web.core";

const { Component, useState, useSubEnv, useChildSubEnv, onWillStart } = owl;

export class TemplateDialog extends Component {
  setup() {
    this.orm = useService("orm");
    this.rpc = useService("rpc");
    this.viewService = useService("view");
    this.notificationService = useService("notification");

    this.data = this.env.dialogData;
    useHotkey("escape", () => this.data.close());

    this.dialogTitle = this.env._t("Print from template");
    this.limit = 9;
    this.state = useState({
      isOpen: true,
      templates: [],
      totalTemplates: 0,
      selectedTemplateId: null,
      currentOffset: 0,
      isProcessing: false,
    });

    useSubEnv({
      config: {
        ...getDefaultConfig(),
      },
    });

    this.model = new SearchModel(this.env, {
      user: useService("user"),
      orm: this.orm,
      view: useService("view"),
    });

    useChildSubEnv({
      searchModel: this.model,
    });

    this.dp = new DropPrevious();

    onWillStart(async () => {
      const { resModel } = this.props.formControllerProps;
      const views = await this.viewService.loadViews({
        resModel: "onlyoffice.template",
        context: this.props.context,
        views: [[false, "search"]],
      });
      await this.model.load({
        resModel: "onlyoffice.template",
        domain: [["template_model_model", "=", resModel]],
        context: this.props.context,
        orderBy: "id",
        searchMenuTypes: [],
        searchViewArch: views.views.search.arch,
        searchViewId: views.views.search.id,
        searchViewFields: views.fields,
      });
      await this.fetchTemplates();
    });
  }

  async createTemplate() {
    //TODO: create template from dialog
  }

  async fetchTemplates(offset = 0) {
    const { domain, context } = this.model;
    const { records, length } = await this.dp.add(
      this.rpc("/web/dataset/search_read", {
        model: "onlyoffice.template",
        fields: ["name", "create_date", "create_uid", "attachment_id", "mimetype"],
        domain,
        context,
        offset,
        limit: this.limit,
        sort: "id",
      }),
    );
    this.state.templates = records;
    this.state.totalTemplates = length;
  }

  async fillTemplate() {
    this.state.isProcessing = true;

    const templateId = this.state.selectedTemplateId;
    const { resId, resModel } = this.props.formControllerProps;

    const response = await this.rpc("/onlyoffice/template/get_filled_template", {
      template_id: templateId,
      record_id: resId,
      model_name: resModel,
    });

    if (!response) {
      this.notificationService.add(_t("Unknown error"), { type: "danger" });
    } else if (response.href) {
      window.location.href = response.href;
    } else if (response.error) {
      this.notificationService.add(_t(response.error), { type: "danger" });
    }
    this.data.close();
  }

  selectTemplate(templateId) {
    this.state.selectedTemplateId = templateId;
  }

  isSelected(templateId) {
    return this.state.selectedTemplateId === templateId;
  }

  onPagerChange({ offset }) {
    this.state.currentOffset = offset;
    this.state.selectedTemplateId = null;
    return this.fetchTemplates(this.state.currentOffset);
  }

  isButtonDisabled() {
    return this.state.isProcessing || this.state.selectedTemplateId === null;
  }
}

TemplateDialog.template = "onlyoffice_template.TemplateDialog";
TemplateDialog.components = { Dialog, Pager };
