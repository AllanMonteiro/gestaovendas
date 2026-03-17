from rest_framework.renderers import JSONRenderer


class UTF8JSONRenderer(JSONRenderer):
    # Windows PowerShell 5.1 can misdecode JSON without an explicit charset.
    charset = "utf-8"
