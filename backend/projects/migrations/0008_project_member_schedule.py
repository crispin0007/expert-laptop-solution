from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0007_indexes_and_seq'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectMemberSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('work_date', models.DateField(help_text='The calendar date this member is scheduled to work.')),
                ('is_present', models.BooleanField(default=False, help_text='Set to True by the manager once the member has worked this day.')),
                ('note', models.TextField(blank=True)),
                ('member', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='project_schedules',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='schedules',
                    to='projects.project',
                )),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='project_member_schedules',
                    to='tenants.tenant',
                )),
                ('created_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['work_date', 'member__first_name'],
                'unique_together': {('project', 'member', 'work_date')},
            },
        ),
        migrations.AddIndex(
            model_name='projectmemberschedule',
            index=models.Index(fields=['project', 'member'], name='sched_proj_member_idx'),
        ),
        migrations.AddIndex(
            model_name='projectmemberschedule',
            index=models.Index(fields=['project', 'work_date'], name='sched_proj_date_idx'),
        ),
    ]
