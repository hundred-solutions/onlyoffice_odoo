/** @odoo-module **/
import { CANCEL_GLOBAL_CLICK, KanbanRecord } from "@web/views/kanban/kanban_record";
import { useService } from "@web/core/utils/hooks";

export class OnlyofficeKanbanRecord extends KanbanRecord {
  setup() {
    super.setup(...arguments);
    this.orm = useService("orm");
    this.actionService = useService("action");
  }

  /**
   * @override
   */
  async onGlobalClick(ev) {
    if (ev.target.closest(CANCEL_GLOBAL_CLICK) && !ev.target.classList.contains("o_onlyoffice_download")) {
      return;
    }
    if (ev.target.classList.contains("o_onlyoffice_download")) {
      window.location.href = `/onlyoffice/template/download/${this.props.record.data.attachment_id[0]}`;
      return;
    }
    return this.editTemplate();
  }

  async editTemplate() {
    const action = {
      type: "ir.actions.client",
      tag: "onlyoffice_odoo_templates.TemplateEditor",
      target: "current",
    };
    return this.actionService.doAction(action, {
      props: this.props.record.data,
    });
  }
}
