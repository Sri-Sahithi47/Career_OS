"""Export the active uploaded resume and reviewed tailoring without a LaTeX runtime."""

from pathlib import Path
from uuid import uuid4
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from src.settings import settings


def export_resume_pdf(*, resume_text: str, user_name: str, points: list[str], tech_stack: dict, location: str = "") -> tuple[str, str]:
    """Preserve source facts and append reviewed highlights; never reuse another candidate's template."""
    settings.RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    path = Path(settings.RESUMES_DIR) / f"resume_{uuid4().hex}.pdf"
    styles = getSampleStyleSheet()
    body = ParagraphStyle("ResumeBody", parent=styles["BodyText"], fontSize=10, leading=14, spaceAfter=4)
    heading = ParagraphStyle("ResumeHeading", parent=styles["Heading2"], textColor=colors.HexColor("#184d47"), spaceBefore=12)
    story = []
    for index, line in enumerate(resume_text.splitlines()):
        line = line.strip()
        if not line:
            continue
        style = styles["Title"] if index == 0 and len(line) < 100 else body
        story.append(Paragraph(escape(line), style))
    if location.strip():
        story.append(Paragraph(f"Target location: {escape(location.strip())}", body))
    if points:
        story.extend([Spacer(1, 8), Paragraph("Relevant Experience Highlights", heading)])
        for point in points:
            if point.strip():
                story.append(Paragraph(escape(point.strip()), body, bulletText="-"))
    if tech_stack:
        story.append(Paragraph("Relevant Skills", heading))
        for category, skills in tech_stack.items():
            if isinstance(skills, list) and skills:
                story.append(Paragraph(f"<b>{escape(category)}</b>: {escape(', '.join(skills))}", body))
    try:
        SimpleDocTemplate(
            str(path), pagesize=letter, rightMargin=48, leftMargin=48,
            topMargin=42, bottomMargin=42, title=f"{user_name} Resume", author=user_name,
        ).build(story)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return str(path), f"/api/download-resume/{path.name}"
