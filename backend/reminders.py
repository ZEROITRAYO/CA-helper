import sys
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from app import app
from filings import DONE, filing_name
from helpers import date, notify, send_email, now
from models import Business, CaProfile, ComplianceItem, Engagement, EngagementItem, ReminderLog, User, db, db_now


def mark_overdue(today):
    eligible_statuses = ("upcoming", "docs_pending", "ready")

    overdue_items = ComplianceItem.query.filter(
        ComplianceItem.status.in_(eligible_statuses),
        ComplianceItem.due_date < today,
    ).all()


    for item in overdue_items:
        item.status = "overdue"

    db.session.commit()
    return len(overdue_items)




def reminder_kind(days_left):

    if days_left < 0:
        return "overdue"
    
    if days_left <= 1:
        return "t_minus_1"
    
    if days_left <= 3:
        return "t_minus_3"
    
    if days_left <= 7:
        return "t_minus_7"


    return None




def reminder_title(filing, days_left):

    if days_left < 0:
        return f"{filing_name(filing)} is overdue"
    
    if days_left == 0:
        return f"{filing_name(filing)} is due today"
    
    if days_left == 1:
        return f"{filing_name(filing)} is due tomorrow"

    
    return f"{filing_name(filing)} is due in {days_left} days"




def send_reminders(today):
    filings = (
        ComplianceItem.query
        .filter(
            ComplianceItem.due_date <= today + timedelta(days=7),
            ComplianceItem.status.notin_(DONE),
        )
        .order_by(ComplianceItem.due_date)
    )


    emails = {}
    count = 0

    for filing in filings:
        days_left = (filing.due_date - today).days
        kind = reminder_kind(days_left)
        business = db.session.get(Business, filing.business_id)

        if kind is None:
            continue

        if ReminderLog.query.filter_by(
            compliance_item_id=filing.id, kind=kind
        ).first():
            continue

        if filing.due_date < date(business.created_at):
            continue

        db.session.add(ReminderLog(
            compliance_item_id=filing.id,
            kind=kind,
            sent_at=db_now(),
        ))

        count += 1

        due = f"{filing.due_date.day} {filing.due_date:%b %Y}"

        body = (
            f"It was due on {due}. File it as soon as you can."

            if kind == "overdue"
            else f"Due on {due}."
        )

        title = reminder_title(filing, days_left)
        people = [
            (
                db.session.get(User, business.user_id),
                title,
                f"/business/compliance/{filing.id}",
            )
        ]

        engagement = (
            Engagement.query
            .join(EngagementItem, EngagementItem.engagement_id == Engagement.id)
            .filter(
                EngagementItem.compliance_item_id == filing.id,
                Engagement.status == "active",
            )
            .first()
        )

        if engagement:
            profile = db.session.get(CaProfile, engagement.ca_profile_id)
            ca_user = db.session.get(User, profile.user_id)
            people.append((
                ca_user,
                f"{business.legal_name}: {title}",
                f"/ca/clients/{business.id}",
            ))

        notification_type = (
            "overdue" if kind == "overdue" else "deadline_reminder"
        )


        for user, user_title, link in people:
            notify(user, notification_type, user_title, body, link)

            if user.email_notifications:
                emails.setdefault(user, []).append((user_title, body))

    db.session.commit()

    for user, lines in emails.items():
        subject = (
            lines[0][0]
            if len(lines) == 1
            else f"{len(lines)} filings need your attention"
        )
        send_email(
            user.email,
            subject,
            "reminders",
            name=user.full_name,
            lines=[f"{title}. {body}" for title, body in lines],
        )

    return count


if __name__ == "__main__":
    with app.app_context():

        if "--once" in sys.argv:
            today = (
                datetime.fromisoformat(sys.argv[2]).date()

                if len(sys.argv) > 2
                else now()
            )

            print("Overdue:", mark_overdue(today), "- reminders recorded:", send_reminders(today))
            sys.exit()

        last_reminder_day = None

        while True:
            today = now()
            mark_overdue(today)

            india_today = datetime.now(ZoneInfo("Asia/Kolkata"))
            if (india_today.strftime("%H:%M") >= "08:15" and india_today.date() != last_reminder_day):
                print("Reminders recorded:", send_reminders(india_today.date()))
                last_reminder_day = india_today.date()

            time.sleep(15 * 60)
