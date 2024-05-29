import base64
import copy
import json
import re

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.addons.onlyoffice_odoo.utils import file_utils


class OnlyOfficeTemplate(models.Model):
    _name = "onlyoffice.template"
    _description = "ONLYOFFICE Template"

    name = fields.Char(required=True, string="Template Name")
    template_model_id = fields.Many2one("ir.model", string="Select Model")
    template_model_name = fields.Char("Model Description", related="template_model_id.name")
    template_model_model = fields.Char("Model", related="template_model_id.model")
    file = fields.Binary(string="Upload an existing template")
    attachment_id = fields.Many2one("ir.attachment", readonly=True)
    mimetype = fields.Char(default="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    @api.onchange("name")
    def _onchange_name(self):
        if self.attachment_id:
            self.attachment_id.name = self.name + ".docxf"
            self.attachment_id.display_name = self.name

    @api.model
    def create(self, vals):
        file = vals.get("file") or base64.encodebytes(file_utils.get_default_file_template(self.env.user.lang, "docx"))
        mimetype = file_utils.get_mime_by_ext("docx")

        vals["file"] = file
        vals["mimetype"] = mimetype

        datas = vals.pop("file", None)
        record = super(OnlyOfficeTemplate, self).create(vals)
        if datas:
            attachment = self.env["ir.attachment"].create(
                {
                    "name": vals.get("name", record.name) + ".docxf",
                    "display_name": vals.get("name", record.name),
                    "mimetype": vals.get("mimetype", ""),
                    "datas": datas,
                    "res_model": self._name,
                    "res_id": record.id,
                }
            )
            record.attachment_id = attachment.id
        return record

    @api.model
    def get_fields_for_model(self, model_name):
        processed_models = set()
        cached_models = {}

        def process_model(model_name):
            if model_name in processed_models:
                return
            processed_models.add(model_name)

            description = self.env["ir.model"].search_read([["model", "=", model_name]], ["name"])
            fields = self.env[model_name].fields_get()

            field_list = []
            for field_name, field_props in fields.items():
                field_type = field_props["type"]
                if field_type in ["html", "binary", "json"]:
                    continue  # TODO:

                field_dict = {
                    "name": field_name,
                    "string": field_props.get("string", ""),
                    "type": field_props["type"],
                }

                if field_type in ["one2many", "many2many", "many2one"]:
                    related_model = field_props["relation"]
                    if cached_models.get(related_model):
                        field_dict["related_model"] = copy.deepcopy(cached_models[related_model])
                        field_dict["related_model"]["name"] = field_name
                    else:
                        if field_type == "many2one":
                            related_description = self.env["ir.model"].search_read([["model", "=", related_model]], ["name"])
                            related_fields = self.env[related_model].fields_get()

                            related_field_list = []
                            for (related_field_name, related_field_props) in related_fields.items():
                                related_field_dict = {
                                    "name": related_field_name,
                                    "string": related_field_props.get("string", ""),
                                    "type": related_field_props["type"],
                                }
                                related_field_list.append(related_field_dict)
                            related_model_info = {
                                "name": field_name,
                                "description": related_description[0]["name"],
                                "fields": related_field_list,
                            }
                            field_dict["related_model"] = related_model_info
                            cached_models[related_model] = related_model_info
                        else:
                            processed_model = process_model(related_model)
                            if processed_model:
                                field_dict["related_model"] = processed_model
                                cached_models[related_model] = processed_model

                field_list.append(field_dict)

            model_info = {
                "name": model_name,
                "description": description[0]["name"],
                "fields": field_list,
            }

            processed_models.discard(model_name)
            return model_info

        models_info = process_model(model_name)
        data = json.dumps(models_info, ensure_ascii=False)
        return data
