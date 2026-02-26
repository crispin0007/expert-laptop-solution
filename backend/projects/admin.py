from django.contrib import admin
from .models import Project, ProjectMilestone, ProjectTask, ProjectProductRequest


class ProjectMilestoneInline(admin.TabularInline):
    model = ProjectMilestone
    extra = 0


class ProjectTaskInline(admin.TabularInline):
    model = ProjectTask
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'customer', 'manager', 'status', 'start_date', 'end_date', 'tenant')
    list_filter = ('status',)
    search_fields = ('name',)
    inlines = [ProjectMilestoneInline]


@admin.register(ProjectMilestone)
class ProjectMilestoneAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'due_date', 'is_completed')
    list_filter = ('is_completed',)


@admin.register(ProjectTask)
class ProjectTaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'assigned_to', 'status', 'priority', 'due_date')
    list_filter = ('status', 'priority')
    search_fields = ('title',)


@admin.register(ProjectProductRequest)
class ProjectProductRequestAdmin(admin.ModelAdmin):
    list_display = ('product', 'project', 'quantity', 'status', 'requested_by', 'reviewed_by', 'reviewed_at')
    list_filter = ('status',)
    search_fields = ('product__name', 'project__name')
    readonly_fields = ('reviewed_at',)
